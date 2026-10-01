export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { attachConnectingIp } = await import('./proxy/connecting-ip');
  attachConnectingIp();
}
