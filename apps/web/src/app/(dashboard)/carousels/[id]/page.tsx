import { CarouselDetailClient } from "@/components/carousels/carousel-detail-client";

export const dynamic = "force-dynamic";

export default async function CarouselDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CarouselDetailClient carouselId={Number(id)} />;
}
