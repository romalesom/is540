import { EmptyState, ButtonLink, Card } from "@/components/ui";

export default function NotFound() {
  return (
    <Card className="mx-auto mt-16 max-w-md pb-8 text-center">
      <EmptyState icon="explore_off" title="Page not found" text="This page does not exist (yet)." />
      <ButtonLink href="/">Back to home</ButtonLink>
    </Card>
  );
}
