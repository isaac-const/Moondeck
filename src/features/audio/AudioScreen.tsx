import { Volume2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PhaseChip } from "@/components/ui/PhaseChip";

export function AudioScreen() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("audio.title")}
        description={t("audio.description")}
        actions={<PhaseChip>Fase 4</PhaseChip>}
      />
      <EmptyState icon={Volume2} title={t("audio.emptyTitle")} body={t("audio.emptyBody")} />
    </div>
  );
}
