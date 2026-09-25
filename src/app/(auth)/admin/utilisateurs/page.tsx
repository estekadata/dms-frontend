"use client";
import { useState, useEffect, useCallback } from "react";
import { Copy, Check, X, RefreshCw, AlertTriangle, KeyRound } from "lucide-react";
import { hashPassword } from "@/lib/hash";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { SortHeader, useClientSort } from "@/components/sortable";
import { Badge } from "@/components/ui/badge";

type User = {
  id: number;
  email: string;
  nom?: string | null;
  role: "super_admin" | "admin" | "vhu";
  actif: boolean;
  created_at?: string;
  last_login?: string | null;
};

const ROLES: Array<{ value: "super_admin" | "admin" | "vhu"; label: string; help: string }> = [
  { value: "super_admin", label: "Super admin", help: "Accès complet, y compris gestion utilisateurs et import" },
  { value: "admin", label: "Admin", help: "Accès complet sauf admin (utilisateurs, import)" },
  { value: "vhu", label: "Centre VHU", help: "Accès uniquement à la page /vhu" },
];

function generatePassword(length = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

function roleBadgeClass(role: string) {
  if (role === "super_admin")
    return "bg-[rgba(167,139,250,0.10)] text-purple-600 border border-[rgba(167,139,250,0.20)] hover:bg-[rgba(167,139,250,0.15)]";
  if (role === "vhu")
    return "bg-[rgba(96,165,250,0.10)] text-blue-600 border border-[rgba(96,165,250,0.20)] hover:bg-[rgba(96,165,250,0.15)]";
  return "bg-[rgba(90,100,120,0.10)] text-text-dim border border-[rgba(90,100,120,0.20)] hover:bg-[rgba(90,100,120,0.15)]";
}

export default function UtilisateursPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    email: "",
    nom: "",
    password: "",
    role: "vhu" as "super_admin" | "admin" | "vhu",
  });
  const [saving, setSaving] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string; nom: string } | null>(null);
  const { sorted, sortKey, sortDir, onSort } = useClientSort(users);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setLoadError(json.error || `Erreur ${res.status}`);
        setUsers([]);
      } else {
        setUsers(json.users || []);
      }
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Erreur réseau");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActif(user: User) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_actif", user_id: user.id, actif: !user.actif }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`Erreur : ${j.error || res.status}`);
      return;
    }
    load();
  }

  async function deleteUser(user: User) {
    if (!confirm(`Supprimer définitivement ${user.email} ? Cette action est irréversible.`)) return;
    const res = await fetch(`/api/admin/users?id=${user.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`Erreur : ${j.error || res.status}`);
      return;
    }
    load();
  }

  async function resetPassword(user: User) {
    if (
      !confirm(
        `Réinitialiser le mot de passe de ${user.email} ?\n\nUn nouveau mot de passe sera généré et affiché une seule fois. L'ancien ne fonctionnera plus.`
      )
    )
      return;
    const newPwd = generatePassword();
    const password_hash = await hashPassword(newPwd);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "change_password", user_id: user.id, password_hash }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`Erreur : ${j.error || res.status}`);
      return;
    }
    setCreatedCreds({ email: user.email, password: newPwd, nom: user.nom || "" });
  }

  async function createUser() {
    const email = form.email.trim().toLowerCase().replace(/[<>"']/g, "");
    const password = form.password;
    if (!email || !password) {
      alert("Email et mot de passe requis");
      return;
    }
    if (password.length < 6) {
      alert("Le mot de passe doit faire au moins 6 caractères");
      return;
    }
    setSaving(true);
    try {
      const password_hash = await hashPassword(password);
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          email,
          nom: form.nom || null,
          role: form.role,
          password_hash,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(`Erreur : ${json.error || res.status}`);
        return;
      }
      setCreatedCreds({ email, password, nom: form.nom });
      setShowForm(false);
      setForm({ email: "", nom: "", password: "", role: "vhu" });
      load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Gestion des utilisateurs" description="Administration des accès et des rôles" />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-text-dim font-semibold uppercase">Total utilisateurs</p>
            <p className="text-2xl font-bold text-brand">{users.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-text-dim font-semibold uppercase">Actifs</p>
            <p className="text-2xl font-bold text-emerald-600">{users.filter((u) => u.actif).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-text-dim font-semibold uppercase">Centres VHU</p>
            <p className="text-2xl font-bold text-blue-600">{users.filter((u) => u.role === "vhu").length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between items-center mb-5">
        <h2 className="text-base font-semibold text-text-dim">Liste des utilisateurs</h2>
        <Button
          onClick={() => {
            setShowForm(!showForm);
            if (!showForm)
              setForm((f) => ({ ...f, password: f.password || generatePassword() }));
          }}
          className="bg-brand hover:bg-brand/80 text-white rounded-[11px]"
        >
          + Nouvel utilisateur
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6 border-brand-mid">
          <CardContent className="p-5">
            <h3 className="font-semibold text-foreground mb-4">Créer un utilisateur</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="email" className="text-text-dim">Email / Identifiant *</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="mt-1 bg-surface-alt border-border text-foreground"
                  placeholder="centre.vhu@exemple.fr"
                />
              </div>
              <div>
                <Label htmlFor="nom" className="text-text-dim">Nom (société / centre)</Label>
                <Input
                  id="nom"
                  value={form.nom}
                  onChange={(e) => setForm({ ...form, nom: e.target.value })}
                  className="mt-1 bg-surface-alt border-border text-foreground"
                  placeholder="Casse Untel SARL"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="password" className="text-text-dim">Mot de passe *</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    id="password"
                    type="text"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="bg-surface-alt border-border text-foreground font-mono"
                    placeholder="Mot de passe en clair"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setForm({ ...form, password: generatePassword() })}
                    title="Générer un mot de passe aléatoire"
                  >
                    <RefreshCw size={14} className="mr-1" /> Générer
                  </Button>
                </div>
                <p className="text-xs text-text-muted mt-1">
                  Note ce mot de passe : tu ne pourras plus le revoir après création (seul un nouveau pourra être défini).
                </p>
              </div>
              <div className="col-span-2">
                <Label className="text-text-dim">Rôle</Label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {ROLES.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setForm({ ...form, role: r.value })}
                      className={`text-left p-3 rounded-lg border transition-all ${
                        form.role === r.value
                          ? "border-brand bg-brand-soft"
                          : "border-border bg-surface-alt hover:bg-surface-hover"
                      }`}
                    >
                      <p className="text-sm font-semibold text-foreground">{r.label}</p>
                      <p className="text-xs text-text-dim mt-0.5">{r.help}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <Button
                onClick={createUser}
                disabled={saving || !form.email || !form.password}
                className="bg-brand hover:bg-brand/80 text-white rounded-[11px]"
              >
                {saving ? "Création..." : "Créer l'utilisateur"}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Annuler
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loadError && (
        <div className="mb-5 bg-[rgba(248,113,113,0.08)] border border-[rgba(248,113,113,0.25)] rounded-[14px] p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-red-600">Erreur de chargement</p>
            <p className="text-text-dim mt-1">{loadError}</p>
            <p className="text-text-muted text-xs mt-2">
              Vérifie que tu es connecté en super_admin et que <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> est défini dans Vercel.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-text-muted">Chargement...</div>
      ) : (
        <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt text-text-dim text-xs uppercase">
              <tr>
                <SortHeader label="Nom" active={sortKey === "nom"} dir={sortDir} onClick={() => onSort("nom")} />
                <SortHeader label="Email" active={sortKey === "email"} dir={sortDir} onClick={() => onSort("email")} />
                <SortHeader label="Rôle" align="center" active={sortKey === "role"} dir={sortDir} onClick={() => onSort("role")} />
                <SortHeader label="Créé le" active={sortKey === "created_at"} dir={sortDir} onClick={() => onSort("created_at")} />
                <SortHeader label="Dernière connexion" active={sortKey === "last_login"} dir={sortDir} onClick={() => onSort("last_login")} />
                <SortHeader label="Statut" align="center" active={sortKey === "actif"} dir={sortDir} onClick={() => onSort("actif")} />
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((u) => (
                <tr key={u.id} className="hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{u.nom || "—"}</td>
                  <td className="px-4 py-3 text-text-dim font-mono text-xs">{u.email}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge className={roleBadgeClass(u.role)}>
                      {u.role === "super_admin" ? "Super admin" : u.role === "vhu" ? "Centre VHU" : "Admin"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-text-muted text-xs">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  <td className="px-4 py-3 text-text-muted text-xs">
                    {u.last_login ? new Date(u.last_login).toLocaleDateString("fr-FR") : "Jamais"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge
                      className={
                        u.actif
                          ? "bg-[rgba(52,211,153,0.10)] text-emerald-600 border border-[rgba(52,211,153,0.20)] hover:bg-[rgba(52,211,153,0.15)]"
                          : "bg-[rgba(90,100,120,0.10)] text-text-muted border border-[rgba(90,100,120,0.20)] hover:bg-[rgba(90,100,120,0.15)]"
                      }
                    >
                      {u.actif ? "Actif" : "Inactif"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resetPassword(u)}
                        title="Générer un nouveau mot de passe"
                      >
                        <KeyRound size={14} className="mr-1" /> Réinit. MDP
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => toggleActif(u)}>
                        {u.actif ? "Désactiver" : "Activer"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteUser(u)}
                        className="text-text-dim hover:text-destructive"
                      >
                        Supprimer
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && !loadError && (
            <p className="text-center py-10 text-text-muted italic">Aucun utilisateur</p>
          )}
        </div>
      )}

      {createdCreds && <CredentialsModal creds={createdCreds} onClose={() => setCreatedCreds(null)} />}
    </div>
  );
}

function CredentialsModal({
  creds,
  onClose,
}: {
  creds: { email: string; password: string; nom: string };
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const text = `Email : ${creds.email}\nMot de passe : ${creds.password}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("Impossible de copier — sélectionne et copie manuellement.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-surface rounded-[14px] border border-border shadow-xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">
            {creds.nom ? `Compte créé pour ${creds.nom}` : "Compte créé"}
          </h2>
          <button onClick={onClose} className="text-text-dim hover:text-foreground p-1 rounded">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-[rgba(251,191,36,0.10)] border border-[rgba(251,191,36,0.30)] rounded-lg px-4 py-3 flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-foreground">
              <span className="font-semibold">Note ces identifiants maintenant.</span>{" "}
              Le mot de passe ne sera plus visible après cette fenêtre.
            </p>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase text-text-dim mb-1">Email</p>
              <p className="font-mono text-sm bg-surface-alt border border-border rounded-lg px-3 py-2 text-foreground select-all">
                {creds.email}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-text-dim mb-1">Mot de passe</p>
              <p className="font-mono text-sm bg-surface-alt border border-border rounded-lg px-3 py-2 text-foreground select-all">
                {creds.password}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 bg-surface-alt border-t border-border">
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
          <Button onClick={copy}>
            {copied ? (
              <>
                <Check size={14} className="mr-1" /> Copié
              </>
            ) : (
              <>
                <Copy size={14} className="mr-1" /> Copier les identifiants
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
