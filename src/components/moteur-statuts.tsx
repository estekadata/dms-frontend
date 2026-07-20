"use client";
import { Badge } from "@/components/ui/badge";

// tbl_etats_divers (n_etat → libellé) : sert à la fois pour compo_moteur (composition)
// et etat_moteur (état mécanique). Réf. figée depuis la base Access du client.
const ETATS_DIVERS: Record<number, string> = {
  1: "Moteur + BV",
  2: "Moteur seul",
  4: "Tournant",
  5: "Bloqué",
  6: "Sans compressions",
  7: "Bloc cassé",
  8: "Bon",
  9: "HS",
  10: "Sans carter huile",
  11: "Oui",
  13: "Non",
  15: "Moteur + BV 4",
  16: "Moteur + BVA",
};

// tbl_affectations (n_affectation → libellé)
const AFFECTATIONS: Record<number, string> = {
  1: "Exportation",
  2: "Rénovation",
  3: "Pièces (export)",
  4: "Démontage",
};

// États mécaniques dégradés (badge rouge)
const ETAT_ALERTE = new Set([5, 6, 7, 9]); // Bloqué, Sans compressions, Bloc cassé, HS

export function compoLabel(n?: number | null) {
  return n != null ? ETATS_DIVERS[n] : undefined;
}
export function etatMoteurLabel(n?: number | null) {
  return n != null ? ETATS_DIVERS[n] : undefined;
}
export function affectationLabel(n?: number | null) {
  return n != null ? AFFECTATIONS[n] : undefined;
}

/**
 * Badges de statut d'un moteur : composition (moteur seul / + BV / + BVA),
 * état mécanique (Tournant / Bloqué…) et affectation (Démontage, Rénovation…).
 * L'affectation "Exportation" (défaut) est masquée pour ne garder que les cas notables.
 */
export function MoteurStatuts({
  compo,
  etat,
  affect,
  className = "",
}: {
  compo?: number | null;
  etat?: number | null;
  affect?: number | null;
  className?: string;
}) {
  const compoL = compoLabel(compo);
  const etatL = etatMoteurLabel(etat);
  const affectL = affectationLabel(affect);
  const showAffect = affect != null && affect !== 1;

  if (!compoL && !etatL && !showAffect) return null;

  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {compoL && (
        <Badge className="border border-[rgba(96,165,250,0.20)] bg-[rgba(96,165,250,0.10)] text-blue-600">
          {compoL}
        </Badge>
      )}
      {etatL && (
        <Badge
          className={
            ETAT_ALERTE.has(etat as number)
              ? "border border-[rgba(248,113,113,0.20)] bg-[rgba(248,113,113,0.10)] text-red-600"
              : "border border-[rgba(52,211,153,0.20)] bg-[rgba(52,211,153,0.10)] text-emerald-600"
          }
        >
          {etatL}
        </Badge>
      )}
      {showAffect && affectL && (
        <Badge className="border border-[rgba(168,85,247,0.20)] bg-[rgba(168,85,247,0.10)] text-purple-600">
          {affectL}
        </Badge>
      )}
    </div>
  );
}
