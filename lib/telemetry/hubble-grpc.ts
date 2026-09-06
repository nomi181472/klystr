import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as k8s from '@kubernetes/client-node';
import { createKubeConfig } from '@/lib/k8s/discovery';
import { resolveConnection } from '@/lib/k8s/connection-registry';
import type { ConnectionSettings } from '@/lib/types';
import path from 'path';
import fs from 'fs';
import net from 'net';

// Load proto definitions
const PROTO_PATH = path.resolve(process.cwd(), 'lib/telemetry/proto/observer/observer.proto');
const INCLUDE_DIRS = [path.resolve(process.cwd(), 'lib/telemetry/proto')];

let observerClient: unknown = null;
let stream: grpc.ClientReadableStream<unknown> | null = null;

export interface GrpcAggregatedEntry {
  direction: 'IN' | 'OUT';
  srcIp: string;
  srcPort: number;
  dstIp: string;
  dstPort: number;
  srcPodName?: string;
  srcNamespace?: string;
  dstPodName?: string;
  dstNamespace?: string;
  rxBytes: number;
  txBytes: number;
  rxPackets: number;
  txPackets: number;
  txFlagsSeen: number;
  lastSeen: number;
}

export const aggregatedGrpcFlows = new Map<string, GrpcAggregatedEntry>();

/**
 * Fast TCP probe to verify if host:port accepts connections
 */
function testTcpPort(host: string, port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isResolved = false;

    const cleanup = (result: boolean) => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve(result);
      }
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => cleanup(true));
    socket.once('timeout', () => cleanup(false));
    socket.once('error', () => cleanup(false));

    try {
      socket.connect(port, host);
    } catch {
      cleanup(false);
    }
  });
}

/**
 * Determine the most suitable and reachable host for the Hubble Relay NodePort
 */
export async function resolveHubbleHost(nodePort: number, settings?: Partial<ConnectionSettings>): Promise<string> {
  const candidateHosts: string[] = [];

  // 1. Primary candidate: hostname from clusterUrl (already proven reachable for K8s API)
  try {
    const connection = resolveConnection(settings);
    if (connection?.clusterUrl) {
      const u = new URL(connection.clusterUrl);
      if (u.hostname && !candidateHosts.includes(u.hostname)) {
        candidateHosts.push(u.hostname);
      }
    }
  } catch {
    if (settings?.clusterUrl) {
      try {
        const u = new URL(settings.clusterUrl);
        if (u.hostname && !candidateHosts.includes(u.hostname)) {
          candidateHosts.push(u.hostname);
        }
      } catch { /* ignore invalid URL */ }
    }
  }

  // 2. Candidate IPs from cluster nodes
  try {
    const kc = createKubeConfig(settings);
    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    const nodes = await k8sApi.listNode();
    for (const node of nodes.items ?? []) {
      const addresses = node.status?.addresses || [];
      const ext = addresses.find(a => a.type === 'ExternalIP')?.address;
      const int = addresses.find(a => a.type === 'InternalIP')?.address;
      if (ext && !candidateHosts.includes(ext)) candidateHosts.push(ext);
      if (int && !candidateHosts.includes(int)) candidateHosts.push(int);
    }
  } catch (err) {
    console.warn('Could not query cluster nodes for host candidates:', err instanceof Error ? err.message : err);
  }

  // 3. Fallback candidates for local single-node / microk8s setups
  if (!candidateHosts.includes('127.0.0.1')) candidateHosts.push('127.0.0.1');
  if (!candidateHosts.includes('localhost')) candidateHosts.push('localhost');

  // Probe candidates with fast TCP handshake
  for (const host of candidateHosts) {
    const isReachable = await testTcpPort(host, nodePort, 600);
    if (isReachable) {
      console.log(`[Hubble gRPC] Selected verified reachable host: ${host}:${nodePort}`);
      return host;
    }
  }

  // If probe times out or fails (e.g. NodePort still binding), use cluster endpoint host
  const fallback = candidateHosts[0] || '127.0.0.1';
  console.log(`[Hubble gRPC] Candidate probe completed without direct match, falling back to: ${fallback}:${nodePort}`);
  return fallback;
}

export function isHubbleGrpcStreaming(): boolean {
  return stream !== null;
}

/**
 * Start the gRPC stream
 */
export async function startHubbleGrpcStream(nodePort: number, settings?: Partial<ConnectionSettings>) {
  try {
    if (stream) {
      console.log('[Hubble gRPC] Stream is already running.');
      return;
    }

    if (!fs.existsSync(PROTO_PATH)) {
      console.warn(`[Hubble gRPC] Proto definition not found at ${PROTO_PATH}`);
      return;
    }

    const host = await resolveHubbleHost(nodePort, settings);
    const address = `${host}:${nodePort}`;
    console.log(`[Hubble gRPC] Initiating client connection to ${address}`);

    const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
      includeDirs: INCLUDE_DIRS,
    });
    
    const observerProto = grpc.loadPackageDefinition(packageDefinition).observer as unknown as Record<string, unknown>;
    if (!observerProto || !observerProto.Observer) {
      console.warn('[Hubble gRPC] Observer service definition not found in loaded proto.');
      return;
    }

    const Observer = observerProto.Observer as new (address: string, credentials: grpc.ChannelCredentials) => unknown;
    observerClient = new Observer(address, grpc.credentials.createInsecure());

    // Request live flows
    const request = {
      follow: true,
    };

    stream = (observerClient as { GetFlows: (req: unknown) => grpc.ClientReadableStream<unknown> }).GetFlows(request);

    stream.on('data', (response: unknown) => {
      try {
        const res = response as {
          flow?: {
            reply?: boolean;
            is_reply?: boolean | { value?: boolean };
            IP?: { source?: string; destination?: string };
            l4?: {
              TCP?: {
                source_port?: number;
                destination_port?: number;
                flags?: {
                  FIN?: boolean;
                  SYN?: boolean;
                  RST?: boolean;
                  PSH?: boolean;
                  ACK?: boolean;
                };
              };
              UDP?: { source_port?: number; destination_port?: number };
            };
            source?: {
              namespace?: string;
              pod_name?: string;
            };
            destination?: {
              namespace?: string;
              pod_name?: string;
            };
          };
        };
        if (!res.flow) return;
        
        const flow = res.flow;
        const isReply = typeof flow.reply === 'boolean'
          ? flow.reply
          : (typeof flow.is_reply === 'object' && flow.is_reply !== null
              ? Boolean(flow.is_reply.value)
              : Boolean(flow.is_reply));
        
        const srcIp = flow.IP?.source;
        const dstIp = flow.IP?.destination;
        const srcPort = flow.l4?.TCP?.source_port || flow.l4?.UDP?.source_port || 0;
        const dstPort = flow.l4?.TCP?.destination_port || flow.l4?.UDP?.destination_port || 0;

        if (!srcIp || !dstIp) return;

        const direction = isReply ? 'OUT' : 'IN';
        const key = `${direction}:${srcIp}:${srcPort}->${dstIp}:${dstPort}`;
        
        const now = Date.now();
        const existing = aggregatedGrpcFlows.get(key) || {
          direction,
          srcIp,
          srcPort,
          dstIp,
          dstPort,
          srcPodName: flow.source?.pod_name,
          srcNamespace: flow.source?.namespace,
          dstPodName: flow.destination?.pod_name,
          dstNamespace: flow.destination?.namespace,
          rxBytes: 0,
          txBytes: 0,
          rxPackets: 0,
          txPackets: 0,
          txFlagsSeen: 0,
          lastSeen: now,
        };

        existing.lastSeen = now;

        if (flow.source?.pod_name) existing.srcPodName = flow.source.pod_name;
        if (flow.source?.namespace) existing.srcNamespace = flow.source.namespace;
        if (flow.destination?.pod_name) existing.dstPodName = flow.destination.pod_name;
        if (flow.destination?.namespace) existing.dstNamespace = flow.destination.namespace;

        const isPsh = Boolean(flow.l4?.TCP?.flags?.PSH);
        const isSynOrFin = Boolean(flow.l4?.TCP?.flags?.SYN || flow.l4?.TCP?.flags?.FIN);
        const estimatedSize = isPsh ? 1460 : (isSynOrFin ? 64 : 1024);

        if (direction === 'IN') {
          existing.rxBytes += estimatedSize;
          existing.rxPackets += 1;
        } else {
          existing.txBytes += estimatedSize;
          existing.txPackets += 1;
        }

        if (flow.l4?.TCP?.flags?.RST) {
          existing.txFlagsSeen |= 0x04;
        }

        aggregatedGrpcFlows.set(key, existing);
      } catch (err) {
        console.error('[Hubble gRPC] Packet processing error:', err);
      }
    });

    stream.on('error', (err) => {
      console.warn('[Hubble gRPC] Stream notification:', err instanceof Error ? err.message : err);
      stopHubbleGrpcStream();
    });

    stream.on('end', () => {
      console.log('[Hubble gRPC] Stream terminated by server.');
      stopHubbleGrpcStream();
    });
  } catch (err: unknown) {
    console.error('[Hubble gRPC] Failed to start stream:', err);
    stopHubbleGrpcStream();
  }
}

/**
 * Stop the gRPC stream
 */
export function stopHubbleGrpcStream() {
  if (stream) {
    try {
      stream.cancel();
    } catch { /* cleanup safely */ }
    stream = null;
  }
  if (observerClient) {
    try {
      (observerClient as { close: () => void }).close();
    } catch { /* cleanup safely */ }
    observerClient = null;
  }
}
