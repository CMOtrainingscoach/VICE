import { notFound } from "next/navigation";
import { SurveyPublicRunner } from "@/components/survey/survey-public-runner";
import { loadPublishedSurveyAction } from "@/modules/survey/survey-actions";

export default async function PublicSurveyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ embed?: string }>;
}) {
  const { slug } = await params;
  const { embed } = await searchParams;
  const loaded = await loadPublishedSurveyAction(slug);
  if (!loaded.ok || !loaded.data) notFound();

  return (
    <SurveyPublicRunner slug={slug} survey={loaded.data} embed={embed === "1"} />
  );
}
