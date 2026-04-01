"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type User = {
  id: string;
  email?: string;
  nom?: string;
  role?: string;
  actif?: boolean;
  last_login?: string;
  created_at?: string;
};

const ROLES = ["super_admin", "admin", "commercial", "gestionnaire", "utilisateur"];

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function UtilisateursPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ email: "", nom: "", role: "utilisateur", password: "" });
  const [creating, setCreating] = useState(false);

  // Password change
  const [pwUser, setPwUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  async function loadUsers() {
    setLoading(true);
    setError("");
    const { data } = await supabase
      .from("dms_users")
      .select("id, email, nom, role, actif, last_login, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    setUsers(data || []);
    setLoading(false);
  }

  useEffect(() => { loadUsers(); }, []);

  async function createUser() {
    if (!createForm.email || !createForm.password) {
      setError("Email et mot de passe requis");
      return;
    }
    if (createForm.password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caracteres");
      return;
    }
    setCreating(true);
    setError("");

    try {
      const hashedPw = await sha256(createForm.password);
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          email: createForm.email,
          nom: createForm.nom,
          role: createForm.role,
          password_hash: hashedPw,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Erreur lors de la creation");
      } else {
        setShowCreate(false);
        setCreateForm({ email: "", nom: "", role: "utilisateur", password: "" });
        loadUsers();
      }
    } catch (err: any) {
      setError("Erreur reseau: " + err.message);
    }
    setCreating(false);
  }

  async function toggleActif(user: User) {
    setError("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_actif",
          user_id: user.id,
          actif: !user.actif,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Erreur");
      } else {
        loadUsers();
      }
    } catch (err: any) {
      setError("Erreur reseau: " + err.message);
    }
  }

  async function changePassword() {
    if (!pwUser || !newPassword) return;
    if (newPassword.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caracteres");
      return;
    }
    setPwSaving(true);
    setError("");

    try {
      const hashedPw = await sha256(newPassword);
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change_password",
          user_id: pwUser.id,
          password_hash: hashedPw,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Erreur");
      } else {
        setPwUser(null);
        setNewPassword("");
      }
    } catch (err: any) {
      setError("Erreur reseau: " + err.message);
    }
    setPwSaving(false);
  }

  const nbActifs = users.filter((u) => u.actif !== false).length;
  const nbAdmins = users.filter((u) => u.role === "super_admin" || u.role === "admin").length;

  const roleBadgeColor = (role?: string) => {
    switch (role) {
      case "super_admin": return "bg-red-100 text-red-700 hover:bg-red-100";
      case "admin": return "bg-purple-100 text-purple-700 hover:bg-purple-100";
      case "commercial": return "bg-blue-100 text-blue-700 hover:bg-blue-100";
      case "gestionnaire": return "bg-amber-100 text-amber-700 hover:bg-amber-100";
      default: return "bg-gray-100 text-gray-600 hover:bg-gray-100";
    }
  };

  return (
    <div>
      <PageHeader title="Gestion des utilisateurs" icon="👥" description="Administration des acces et des roles (super_admin)" />

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-semibold uppercase">Total utilisateurs</p>
            <p className="text-2xl font-bold text-[#C41E3A]">{users.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-semibold uppercase">Actifs</p>
            <p className="text-2xl font-bold text-emerald-600">{nbActifs}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-semibold uppercase">Admins</p>
            <p className="text-2xl font-bold text-purple-600">{nbAdmins}</p>
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {/* Actions */}
      <div className="flex justify-between items-center mb-5">
        <h2 className="text-lg font-semibold text-gray-700">Liste des utilisateurs</h2>
        <Button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-[#C41E3A] hover:bg-[#8B1A2B] text-white"
        >
          + Nouvel utilisateur
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card className="mb-6 border-[#C41E3A]/20">
          <CardContent className="p-5">
            <h3 className="font-semibold text-gray-800 mb-4">Creer un utilisateur</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  className="mt-1"
                  placeholder="prenom.nom@exemple.fr"
                />
              </div>
              <div>
                <Label>Nom</Label>
                <Input
                  value={createForm.nom}
                  onChange={(e) => setCreateForm({ ...createForm, nom: e.target.value })}
                  className="mt-1"
                  placeholder="Jean Dupont"
                />
              </div>
              <div>
                <Label>Role</Label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm bg-white"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Mot de passe *</Label>
                <Input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  className="mt-1"
                  placeholder="Min. 6 caracteres"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <Button
                onClick={createUser}
                disabled={creating || !createForm.email || !createForm.password}
                className="bg-[#C41E3A] hover:bg-[#8B1A2B] text-white"
              >
                {creating ? "Creation..." : "Creer"}
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Annuler</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Password change modal */}
      {pwUser && (
        <Card className="mb-6 border-purple-200">
          <CardContent className="p-5">
            <h3 className="font-semibold text-gray-800 mb-2">
              Changer le mot de passe : {pwUser.email}
            </h3>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Label>Nouveau mot de passe</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1"
                  placeholder="Min. 6 caracteres"
                />
              </div>
              <Button
                onClick={changePassword}
                disabled={pwSaving || !newPassword}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {pwSaving ? "..." : "Confirmer"}
              </Button>
              <Button variant="outline" onClick={() => { setPwUser(null); setNewPassword(""); }}>Annuler</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* User table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Chargement...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Nom</th>
                  <th className="px-4 py-3 text-center">Role</th>
                  <th className="px-4 py-3 text-center">Statut</th>
                  <th className="px-4 py-3 text-left">Derniere connexion</th>
                  <th className="px-4 py-3 text-left">Cree le</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{u.email || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{u.nom || "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={roleBadgeColor(u.role)}>{u.role || "utilisateur"}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        className={
                          u.actif !== false
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                            : "bg-gray-100 text-gray-400 hover:bg-gray-100"
                        }
                      >
                        {u.actif !== false ? "Actif" : "Inactif"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {u.last_login ? new Date(u.last_login).toLocaleDateString("fr-FR") : "Jamais"}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString("fr-FR") : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => toggleActif(u)}
                        >
                          {u.actif !== false ? "Desactiver" : "Activer"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => { setPwUser(u); setNewPassword(""); }}
                        >
                          Mot de passe
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {users.length === 0 && <p className="text-center py-10 text-gray-400">Aucun utilisateur</p>}
        </div>
      )}
    </div>
  );
}
