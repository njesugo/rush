import { ReelDetailClient } from "@/components/reels/reel-detail-client";

export const dynamic = "force-dynamic";

export default async function ReelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReelDetailClient reelId={Number(id)} />;
}
