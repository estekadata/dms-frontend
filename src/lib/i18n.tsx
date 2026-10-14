"use client";
import { createContext, useContext, useEffect, useState } from "react";

export type Lang = "fr" | "en";

/**
 * Dictionnaire : le français est la CLÉ (défaut), l'anglais l'override.
 * t("Ventes") → "Ventes" en FR, "Sales" en EN. Les clés non présentes
 * retombent sur le français, donc l'app reste cohérente pendant la
 * traduction incrémentale des écrans.
 */
const EN: Record<string, string> = {
  // Sections
  "Commercial": "Sales",
  "Gestion interne": "Operations",
  "Outils": "Tools",
  // Navigation
  "Ventes": "Sales",
  "Besoins": "Needs",
  "Aide à la commande": "Order assistant",
  "Analyse": "Analytics",
  "États & rapports": "Reports",
  "Déclaration douane": "Customs declaration",
  "Mise à jour prix": "Price update",
  "Mise a jour prix": "Price update",
  "Réceptions": "Receptions",
  "Moteurs": "Engines",
  "Boîtes": "Gearboxes",
  "Boites": "Gearboxes",
  "Géolocalisation": "Location",
  "Réservations": "Reservations",
  "Synthèse réservations": "Reservations summary",
  "Bon de préparation": "Picking sheet",
  "Étiquettes": "Labels",
  "Historique": "History",
  "Pièces détachées": "Spare parts",
  "Pieces Detachees": "Spare parts",
  "Centres VHU": "ELV centers",
  "Tableau de bord": "Dashboard",
  "Espace de travail": "Workspace",
  "Administration": "Administration",
  "Utilisateurs": "Users",
  "Offres VHU": "ELV offers",
  "Synchronisation": "Synchronization",
  "Se déconnecter": "Log out",
  // Chrome / commun
  "Déconnexion": "Log out",
  "Rechercher": "Search",
  "Imprimer": "Print",
  "Exporter": "Export",
  "Valider": "Confirm",
  "Annuler": "Cancel",
  "Enregistrer": "Save",
  "Retour": "Back",
  "Langue": "Language",
  // Login
  "Connexion": "Sign in",
  "Entrez vos identifiants": "Enter your credentials",
  "Email ou identifiant": "Email or username",
  "Mot de passe": "Password",
  "Se connecter": "Sign in",
  "Système de gestion intelligent": "Smart management system",
  "Systeme de gestion intelligent": "Smart management system",
};

const DICT: Record<Lang, Record<string, string>> = { fr: {}, en: EN };

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string) => string };
const LanguageContext = createContext<Ctx>({ lang: "fr", setLang: () => {}, t: (k) => k });

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("fr");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("dms-lang");
      if (saved === "en" || saved === "fr") setLangState(saved);
    } catch {}
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    try { localStorage.setItem("dms-lang", l); } catch {}
    try { document.documentElement.lang = l; } catch {}
  }

  const t = (key: string) => DICT[lang][key] ?? key;

  return <LanguageContext.Provider value={{ lang, setLang, t }}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  return useContext(LanguageContext);
}
export function useT() {
  return useContext(LanguageContext).t;
}
