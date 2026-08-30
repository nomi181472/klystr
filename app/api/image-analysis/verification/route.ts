import { NextResponse } from 'next/server';
import { getImageScan } from '@/lib/image-analysis/service';
import { saveVerifiedImage, verificationStatus } from '@/lib/image-analysis/verification';
import type { ConnectionSettings } from '@/lib/types';

interface VerificationRequest extends Partial<ConnectionSettings> {
  action: 'status' | 'verify';
  identities?: string[];
  imageId?: string;
  criticalAcknowledged?: boolean;
}

export async function POST(request: Request) {
  try {
    const context = new URL(request.url).searchParams.get('ctx') ?? undefined;
    const body = await request.json() as VerificationRequest;
    if (body.action === 'status') {
      const identities = (body.identities ?? []).filter(value => typeof value === 'string' && value.length <= 2048).slice(0, 20);
      return NextResponse.json({ verifications: await verificationStatus(identities, context, body) });
    }
    if (!body.imageId) throw new Error('Image identity is required.');
    const scan = await getImageScan(body.imageId);
    if (!scan || !['completed', 'completed-with-warnings'].includes(scan.status)) throw new Error('The image must have a completed analysis before it can be verified.');
    const hasCritical = scan.vulnerabilities.some(vulnerability => vulnerability.severity === 'CRITICAL');
    if (hasCritical && !body.criticalAcknowledged) return NextResponse.json({ error: 'Critical vulnerabilities require explicit acknowledgement.', requiresCriticalAcknowledgement: true }, { status: 409 });
    await saveVerifiedImage(body.imageId, context, body);
    return NextResponse.json({ verified: true, imageId: body.imageId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update image verification.' }, { status: 400 });
  }
}
