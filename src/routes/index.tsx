import { createFileRoute } from "@tanstack/react-router";
import { HunterDesk } from "@/components/hunter-desk";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <HunterDesk />;
}
