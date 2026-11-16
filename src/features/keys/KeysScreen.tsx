import { Keyboard } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui/EmptyState";
import { Keycap } from "@/components/ui/Keycap";
import { PageHeader } from "@/components/ui/PageHeader";
import { PhaseChip } from "@/components/ui/PhaseChip";

export function KeysScreen() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("keys.title")}
        description={t("keys.description")}
        actions={<PhaseChip>Fase 5</PhaseChip>}
      />
      <EmptyState icon={Keyboard} title={t("keys.emptyTitle")} body={t("keys.emptyBody")}>
        <Keycap tone="ghost">Home</Keycap>
        <Keycap tone="ghost">PgUp</Keycap>
        <Keycap tone="ghost">PgDn</Keycap>
        <Keycap tone="ghost">End</Keycap>
      </EmptyState>
    </div>
  );
}
