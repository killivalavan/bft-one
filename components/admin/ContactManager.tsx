import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Edit2, Plus, Save, Trash2, Phone, ShieldAlert, User, Database } from "lucide-react";

type ExternalContact = {
    id: string;
    name: string;
    role: string;
    phone: string;
};

type SystemUser = {
    id: string;
    email: string;
    full_name?: string | null;
    contact_number?: string | null;
    is_admin?: boolean;
};

interface ContactManagerProps {
    contacts: ExternalContact[];
    systemUsers: SystemUser[];
    onAddContact: (contact: Omit<ExternalContact, "id">) => Promise<void>;
    onUpdateContact: (contact: ExternalContact) => Promise<void>;
    onDeleteContact: (id: string) => Promise<void>;
    onUpdateSystemUser: (id: string, updates: any) => Promise<void>;
    onDeleteSystemUser: (id: string) => Promise<void>;
}

export function ContactManager({
    contacts,
    systemUsers,
    onAddContact,
    onUpdateContact,
    onDeleteContact,
    onUpdateSystemUser,
    onDeleteSystemUser
}: ContactManagerProps) {
    const [isEditing, setIsEditing] = useState<string | null>(null); // 'new', 'sys-<id>', or '<ext-id>'
    const [editForm, setEditForm] = useState<Partial<ExternalContact>>({});
    const [sysEditForm, setSysEditForm] = useState<{ id: string, phone: string }>({ id: '', phone: '' });

    async function handleSave() {
        // External Contact Save
        if (isEditing === 'new' || (isEditing && !isEditing.startsWith('sys-'))) {
            if (!editForm.name || !editForm.phone || !editForm.role) return;
            if (isEditing === 'new') {
                await onAddContact(editForm as any);
            } else {
                await onUpdateContact(editForm as any);
            }
        }
        // System User Save
        else if (isEditing && isEditing.startsWith('sys-')) {
            await onUpdateSystemUser(sysEditForm.id, { contact_number: sysEditForm.phone });
        }

        setIsEditing(null);
        setEditForm({});
        setSysEditForm({ id: '', phone: '' });
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-zinc-900">External Contacts</h2>
                    <p className="text-sm text-zinc-500">Manage directory contacts and system user phone numbers.</p>
                </div>
                <Button onClick={() => { setIsEditing('new'); setEditForm({}); }} className="shrink-0 bg-zinc-900 text-white hover:bg-zinc-800 w-full sm:w-auto">
                    <Plus size={16} className="mr-2" />
                    Add Manual Contact
                </Button>
            </div>

            {isEditing && !isEditing.startsWith('sys-') && (
                <div className="bg-white p-4 rounded-xl shadow-sm border border-zinc-200 space-y-4 animate-in zoom-in-95">
                    <h3 className="text-sm font-bold text-zinc-900 uppercase tracking-wide">{isEditing === 'new' ? 'New Contact' : 'Edit Contact'}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Input
                            placeholder="Role (e.g. Police, Owner)"
                            value={editForm.role || ''}
                            onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                        />
                        <Input
                            placeholder="Name"
                            value={editForm.name || ''}
                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                        />
                        <Input
                            placeholder="Phone Number"
                            value={editForm.phone || ''}
                            onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setIsEditing(null)}>Cancel</Button>
                        <Button size="sm" onClick={handleSave} className="bg-zinc-900 text-white"><Save size={16} className="mr-2" /> Save</Button>
                    </div>
                </div>
            )}

            {isEditing && isEditing.startsWith('sys-') && (
                <div className="bg-white p-4 rounded-xl shadow-sm border border-zinc-200 space-y-4 animate-in zoom-in-95">
                    <h3 className="text-sm font-bold text-zinc-900 uppercase tracking-wide">Edit System User Phone</h3>
                    <div className="flex gap-4 items-center">
                        <div className="text-sm font-medium text-zinc-500 w-1/3">New Number for user:</div>
                        <Input
                            placeholder="Phone Number"
                            value={sysEditForm.phone || ''}
                            onChange={e => setSysEditForm({ ...sysEditForm, phone: e.target.value })}
                            className="flex-1"
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => { setIsEditing(null); setSysEditForm({ id: '', phone: '' }); }}>Cancel</Button>
                        <Button size="sm" onClick={handleSave} className="bg-zinc-900 text-white"><Save size={16} className="mr-2" /> Save</Button>
                    </div>
                </div>
            )}

            {/* --- System Users Section --- */}
            <h3 className="text-lg font-semibold text-zinc-800 flex items-center gap-2 mt-8">
                <Database size={18} className="text-sky-600" />
                System Employees
                <span className="text-xs font-normal text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">Registered Users</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {systemUsers.filter(u => !u.is_admin).map(user => (
                    <div key={user.id} className="bg-white p-4 rounded-xl border border-sky-100 shadow-sm flex flex-col gap-3 relative group hover:border-sky-300 transition-colors">
                        <div className="flex justify-between items-start">
                            <div>
                                <span className="inline-block px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wide mb-1 border bg-sky-50 text-sky-700 border-sky-100">
                                    System User
                                </span>
                                <div className="font-semibold text-zinc-900 text-lg">{user.full_name || user.email}</div>
                                <div className="text-xs text-zinc-400">{user.email}</div>
                            </div>
                            <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-white/50 backdrop-blur-sm rounded-lg p-1">
                                <button
                                    onClick={() => { setIsEditing(`sys-${user.id}`); setSysEditForm({ id: user.id, phone: user.contact_number || '' }); }}
                                    className="p-1.5 hover:bg-zinc-100 rounded-md text-zinc-500"
                                    title="Edit Phone"
                                >
                                    <Edit2 size={14} />
                                </button>
                                <button
                                    onClick={() => onDeleteSystemUser(user.id)}
                                    className="p-1.5 hover:bg-rose-50 rounded-md text-rose-500"
                                    title="Delete User"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                        <div className="mt-auto flex items-center gap-2 text-zinc-600 font-medium">
                            <Phone size={16} className="text-sky-400" />
                            {user.contact_number || <span className="text-zinc-300 italic">No number</span>}
                        </div>
                    </div>
                ))}
                {systemUsers.filter(u => !u.is_admin).length === 0 && (
                    <div className="col-span-full py-6 text-center text-zinc-400 italic">No system employees found.</div>
                )}
            </div>

            {/* --- External Contacts Section --- */}
            <h3 className="text-lg font-semibold text-zinc-800 flex items-center gap-2 border-t pt-8">
                <User size={18} className="text-indigo-600" />
                Manual Entries
                <span className="text-xs font-normal text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">External & Owners</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {contacts.map(contact => (
                    <div key={contact.id} className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm flex flex-col gap-3 relative group hover:border-zinc-300 transition-colors">
                        <div className="flex justify-between items-start">
                            <div>
                                <span className={`inline-block px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wide mb-1 border ${contact.role.toLowerCase() === 'owner' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                                    }`}>
                                    {contact.role}
                                </span>
                                <div className="font-semibold text-zinc-900 text-lg">{contact.name}</div>
                            </div>
                            <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-white/50 backdrop-blur-sm rounded-lg p-1">
                                <button onClick={() => { setIsEditing(contact.id); setEditForm(contact); }} className="p-1.5 hover:bg-zinc-100 rounded-md text-zinc-500"><Edit2 size={14} /></button>
                                <button onClick={() => onDeleteContact(contact.id)} className="p-1.5 hover:bg-rose-50 rounded-md text-rose-500"><Trash2 size={14} /></button>
                            </div>
                        </div>
                        <div className="mt-auto flex items-center gap-2 text-zinc-600 font-medium">
                            <Phone size={16} className="text-zinc-400" />
                            {contact.phone}
                        </div>
                    </div>
                ))}
                {contacts.length === 0 && (
                    <div className="col-span-full py-12 text-center flex flex-col items-center justify-center text-zinc-400 bg-zinc-50/50 rounded-xl border border-dashed border-zinc-200">
                        <ShieldAlert size={32} className="mb-2 opacity-50" />
                        <p>No manual contacts found.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
