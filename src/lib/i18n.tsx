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
  "Retour à l'accueil": "Back to home",
  // Titres de pages (PageHeader)
  "Achats mensuels": "Monthly purchases",
  "Analyse avancée": "Advanced analytics",
  "Analyse des besoins": "Needs analysis",
  "Analyse des ventes": "Sales analysis",
  "Audit des prix": "Price audit",
  "Codes douane (nomenclature SH) par type": "Customs codes (HS) by type",
  "Déclaration douanière": "Customs declaration",
  "Démontage & qualité (ratio KO)": "Dismantling & quality (KO ratio)",
  "Gestion des utilisateurs": "User management",
  "Identification Boîtes de vitesse": "Gearbox identification",
  "Identification Moteurs": "Engine identification",
  "Importer des offres (Excel)": "Import offers (Excel)",
  "Marges par type": "Margins by type",
  "Mise à jour des prix": "Price update",
  "Nouvelle réception": "New reception",
  "Rangement — occupation des emplacements": "Storage — location occupancy",
  "Réceptions par jour": "Receptions per day",
  "Synthèse des réservations": "Reservations summary",
  "Top 15 des ventes": "Top 15 sales",
  // Descriptions de pages
  "Administration des accès et des rôles": "Access and role administration",
  "Ce qui est stocké à chaque emplacement, et les cases libres, pour guider le rangement.": "What is stored at each location, and the free slots, to guide storage.",
  "Charge un fichier Excel d'offres moteurs pour un centre VHU ; elles rejoignent la file d'acceptation.": "Upload an Excel file of engine offers for an ELV center; they join the acceptance queue.",
  "Emplacement physique (chiffre + lettre) des articles : recherche, assignation, validation.": "Physical location (number + letter) of items: search, assignment, validation.",
  "Gestion des arrivages fournisseurs": "Supplier intake management",
  "Gestion des réservations clients": "Customer reservations management",
  "Génère des étiquettes de stock (code-barres scannable) pour les moteurs ou les boîtes.": "Generate stock labels (scannable barcode) for engines or gearboxes.",
  "Import Excel et mise à jour manuelle des prix d'achat proposés": "Excel import and manual update of proposed purchase prices",
  "Inventaire, valorisation du stock et statistiques": "Inventory, stock valuation and statistics",
  "Liste des articles réservés d'un client à préparer — par composition et type, emplacement (ordre de rack), tri par n° interne.": "List of a customer's reserved items to prepare — by composition and type, location (rack order), sorted by internal no.",
  "Liste détaillée ou synthèse chiffrée : choisis la source, les colonnes, les filtres, le regroupement, puis génère.": "Detailed list or numeric summary: choose the source, columns, filters, grouping, then generate.",
  "Moteurs et boîtes les plus vendus sur la période.": "Best-selling engines and gearboxes over the period.",
  "Moteurs et boîtes réservés, cumulés par client et par type": "Reserved engines and gearboxes, aggregated by customer and type",
  "Moteurs recherchés par client — l'outil propose les moteurs disponibles qui correspondent": "Engines wanted by customers — the tool suggests matching available engines",
  "Moteurs à démonter et indicateur de qualité mécanique du stock (ratio KO).": "Engines to dismantle and a stock mechanical-quality indicator (KO ratio).",
  "Nombre de réceptions et de moteurs reçus, jour par jour.": "Number of receptions and engines received, day by day.",
  "Ouvre plusieurs pages en parallèle — chaque onglet garde son état.": "Open several pages in parallel — each tab keeps its state.",
  "Prix d'achat vs prix de vente moyens et marge, par type de moteur, sur la période.": "Average purchase vs sale price and margin, by engine type, over the period.",
  "Propositions des centres VHU en attente de validation": "ELV center proposals awaiting validation",
  "Recherche et consultation du stock BV": "Search and browse gearbox stock",
  "Recherche et consultation du stock moteurs": "Search and browse engine stock",
  "Renseigne le code SH de chaque type de moteur ; il est repris automatiquement dans les déclarations douanières.": "Set the HS code of each engine type; it is reused automatically in customs declarations.",
  "Repère les prix d'achat suspects (erreurs de saisie, virgule manquante) par comparaison à la médiane du type.": "Flags suspicious purchase prices (entry errors, missing decimal) by comparison to the type median.",
  "Récapitulatif d'exportation par expédition / conteneur (marchandises, valeurs, nomenclature SH).": "Export summary by shipment / container (goods, values, HS codes).",
  "Réceptions fournisseurs par mois, montant HT et statut de facturation.": "Supplier receptions by month, net amount and invoicing status.",
  "Réceptions, expéditions et statistiques": "Receptions, shipments and statistics",
  "Saisie d'un arrivage fournisseur — enregistré en brouillon, à valider ensuite": "Enter a supplier intake — saved as draft, to validate later",
  "Statistiques détaillées du stock et des ventes": "Detailed stock and sales statistics",
  "Stock pièces (alternateurs, démarreurs, compresseurs...) — cliquez une référence pour son historique achats/ventes": "Parts stock (alternators, starters, compressors...) — click a reference for its purchase/sale history",
  "Suivi des mises à jour Access → Supabase": "Tracking of Access → Supabase updates",
  "Tendances et statistiques commerciales": "Commercial trends and statistics",
  // Tableau de bord
  "Vue d'ensemble et actions prioritaires": "Overview and priority actions",
  "Top besoins — les plus demandés": "Top needs — most requested",
  "Tout voir": "See all",
  "recherchés en rupture": "wanted, out of stock",
  "offres VHU en attente": "ELV offers pending",
  "dernière synchro": "last sync",
  "Stock épuisé & demandés → à sourcer": "Out of stock & wanted → to source",
  "À valider côté admin": "To validate on admin side",
  "Données peut-être périmées": "Data may be outdated",
  "Synchronisation en retard": "Synchronization overdue",
  // Libellés grille d'accueil (desc)
  "Besoins centres VHU": "ELV center needs",
  "Statistiques": "Statistics",
  "Propositions achat": "Purchase suggestions",
  "Gestion des arrivages": "Intake management",
  "Identification moteurs": "Engine identification",
  "Identification BV": "Gearbox identification",
  "Reservations clients": "Customer reservations",
  "Receptions & expeditions": "Receptions & shipments",
  "Stock alternateurs...": "Alternator stock...",
  "Interface centres VHU": "ELV center interface",
  // Variantes sans accent (grille d'accueil)
  "Receptions": "Receptions",
  "Reservations": "Reservations",
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
