import { RegisteredPluginHost } from '@/components/plugins/RegisteredPluginHost';

export default async function PluginPage({ params }: { params: Promise<{ pluginId: string }> }) {
  const { pluginId } = await params;
  return <RegisteredPluginHost pluginId={pluginId} />;
}
