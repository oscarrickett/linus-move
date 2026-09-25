import { el, clear, fmtRelative, toast } from "../util.js";
import {
  loadInfoRecords, upsertInfoRecord, deleteInfoRecord,
  loadContacts, upsertContact, deleteContact,
  loadLinks, addLink, deleteLink,
} from "../store.js";

export async function renderVault(root, state) {
  clear(root);
  root.append(el("div", { class: "page-head" },
    el("h1", { class: "page-title" }, "Vault"),
    el("span", { class: "page-sub" }, "Everything worth writing down"),
  ));

  const [records, contacts, links] = await Promise.all([
    loadInfoRecords().catch(() => []),
    loadContacts().catch(() => []),
    loadLinks(null).catch(() => []),
  ]);

  // Info records
  root.append(el("div", { class: "section" },
    el("div", { class: "section-head" },
      el("h2", {}, "Information"),
      (() => {
        const b = el("button", { class: "btn small primary" }, "+ Add record");
        b.onclick = () => addRecordFlow();
        return b;
      })(),
    ),
    records.length
      ? el("div", { class: "vault-grid" }, ...records.map(recordCard))
      : el("div", { class: "empty" }, "No records yet."),
  ));

  // Contacts
  root.append(el("div", { class: "section" },
    el("div", { class: "section-head" },
      el("h2", {}, "Contacts"),
      (() => {
        const b = el("button", { class: "btn small primary" }, "+ Add contact");
        b.onclick = () => addContactFlow();
        return b;
      })(),
    ),
    contacts.length
      ? el("div", { class: "vault-grid" }, ...contacts.map(contactCard))
      : el("div", { class: "empty" }, "No contacts yet."),
  ));

  // Global useful links (not attached to a task)
  root.append(el("div", { class: "section" },
    el("div", { class: "section-head" }, el("h2", {}, "Official links")),
    linksBlock(links),
  ));

  function recordCard(r) {
    const card = el("div", { class: "vault-card" });
    const isPrivate = r.visibility === "private_to_linus";
    card.append(
      el("h3", {}, r.key.replaceAll("_", " "), isPrivate ? el("span", { class: "priv-tag" }, "private") : null),
      el("div", { class: "vault-value" }, r.value || "—"),
      r.notes ? el("div", { class: "vault-key" }, r.notes) : null,
      el("div", { class: "vault-key" }, "Updated " + fmtRelative(r.updated_at)),
      el("div", { style: { marginTop: "8px", display: "flex", gap: "6px" } },
        (() => { const b = el("button", { class: "btn small" }, "Edit"); b.onclick = () => editRecordFlow(r); return b; })(),
        (() => { const b = el("button", { class: "btn small danger" }, "Delete"); b.onclick = () => removeRecord(r); return b; })(),
      ),
    );
    return card;
  }

  function contactCard(c) {
    return el("div", { class: "vault-card" },
      el("h3", {}, c.name, c.is_emergency ? el("span", { class: "priv-tag" }, "emergency") : null),
      c.role ? el("div", { class: "vault-key" }, c.role + (c.organisation ? ` · ${c.organisation}` : "")) : null,
      c.phone ? el("div", {}, "Phone: " + c.phone) : null,
      c.email ? el("div", {}, "Email: " + c.email) : null,
      c.notes ? el("div", { class: "vault-key", style: { marginTop: "6px" } }, c.notes) : null,
      el("div", { style: { marginTop: "8px", display: "flex", gap: "6px" } },
        (() => { const b = el("button", { class: "btn small" }, "Edit"); b.onclick = () => editContactFlow(c); return b; })(),
        (() => { const b = el("button", { class: "btn small danger" }, "Delete"); b.onclick = () => removeContact(c); return b; })(),
      ),
    );
  }

  function linksBlock(links) {
    const wrap = el("div", { class: "vault-card" });
    if (!links.length) wrap.append(el("div", { class: "empty" }, "No official links saved yet."));
    for (const l of links) {
      wrap.append(el("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px dashed var(--border)" } },
        el("a", { href: l.url, target: "_blank", rel: "noopener noreferrer", style: { color: "var(--accent-strong)" } }, l.label),
        (() => {
          const b = el("button", { class: "linky" }, "delete");
          b.onclick = async () => { try { await deleteLink(l.id); renderVault(root, state); } catch (err) { toast(err.message, "error"); } };
          return b;
        })(),
      ));
    }
    const label = el("input", { class: "input", placeholder: "Label" });
    const url   = el("input", { class: "input", placeholder: "https://…" });
    const add   = el("button", { class: "btn small primary" }, "Add link");
    add.onclick = async () => {
      if (!label.value.trim() || !url.value.trim()) return;
      try { await addLink({ task_id: null, label: label.value.trim(), url: url.value.trim(), is_official: true }); renderVault(root, state); }
      catch (err) { toast(err.message, "error"); }
    };
    wrap.append(el("div", { style: { display: "flex", gap: "6px", marginTop: "10px", flexWrap: "wrap" } }, label, url, add));
    return wrap;
  }

  function addRecordFlow() { editRecordFlow({ key: "", value: "", notes: "", visibility: "shared" }); }

  function editRecordFlow(r) {
    const overlay = modal(({ close }) => {
      const key   = el("input", { class: "input", value: r.key || "", placeholder: "e.g. skatteverket_case_number" });
      const value = el("textarea", { class: "textarea", placeholder: "Value" }, r.value || "");
      const notes = el("textarea", { class: "textarea", placeholder: "Notes" }, r.notes || "");
      const vis   = el("select", { class: "select" },
        el("option", { value: "shared" }, "Shared with both"),
        el("option", { value: "private_to_linus" }, "Private to Linus"),
      );
      vis.value = r.visibility || "shared";
      const save = el("button", { class: "btn primary" }, "Save");
      save.onclick = async () => {
        try {
          await upsertInfoRecord({ id: r.id, key: key.value.trim(), value: value.value, notes: notes.value, visibility: vis.value });
          close(); renderVault(root, state);
        } catch (err) { toast(err.message, "error"); }
      };
      return el("div", {},
        el("h2", { style: { marginTop: 0 } }, r.id ? "Edit record" : "Add record"),
        field("Key", key),
        field("Value", value),
        field("Notes", notes),
        field("Visibility", vis),
        el("div", { style: { display: "flex", justifyContent: "flex-end", gap: "8px" } },
          (() => { const b = el("button", { class: "btn" }, "Cancel"); b.onclick = close; return b; })(),
          save,
        ),
      );
    });
  }

  async function removeRecord(r) {
    if (!confirm("Delete this record?")) return;
    try { await deleteInfoRecord(r.id); renderVault(root, state); } catch (err) { toast(err.message, "error"); }
  }

  function addContactFlow() { editContactFlow({ name: "", role: "", organisation: "", phone: "", email: "", notes: "", is_emergency: false }); }

  function editContactFlow(c) {
    modal(({ close }) => {
      const name  = el("input", { class: "input", value: c.name || "" });
      const role  = el("input", { class: "input", value: c.role || "", placeholder: "e.g. GP, landlord" });
      const org   = el("input", { class: "input", value: c.organisation || "" });
      const phone = el("input", { class: "input", value: c.phone || "" });
      const email = el("input", { class: "input", value: c.email || "" });
      const notes = el("textarea", { class: "textarea" }, c.notes || "");
      const emerg = el("input", { type: "checkbox" });
      emerg.checked = !!c.is_emergency;
      const save = el("button", { class: "btn primary" }, "Save");
      save.onclick = async () => {
        try {
          await upsertContact({
            id: c.id, name: name.value.trim(), role: role.value, organisation: org.value,
            phone: phone.value, email: email.value, notes: notes.value, is_emergency: emerg.checked,
          });
          close(); renderVault(root, state);
        } catch (err) { toast(err.message, "error"); }
      };
      return el("div", {},
        el("h2", { style: { marginTop: 0 } }, c.id ? "Edit contact" : "Add contact"),
        field("Name", name), field("Role", role), field("Organisation", org),
        field("Phone", phone), field("Email", email), field("Notes", notes),
        el("label", { class: "field", style: { flexDirection: "row", alignItems: "center", gap: "8px" } }, emerg, el("span", {}, "Emergency contact")),
        el("div", { style: { display: "flex", justifyContent: "flex-end", gap: "8px" } },
          (() => { const b = el("button", { class: "btn" }, "Cancel"); b.onclick = close; return b; })(),
          save,
        ),
      );
    });
  }

  async function removeContact(c) {
    if (!confirm("Delete this contact?")) return;
    try { await deleteContact(c.id); renderVault(root, state); } catch (err) { toast(err.message, "error"); }
  }
}

function field(label, control) {
  return el("div", { class: "field" }, el("label", {}, label), control);
}

function modal(build) {
  const root = document.getElementById("drawer-root");
  const backdrop = el("div", { class: "drawer-backdrop" });
  const panel = el("aside", { class: "drawer", style: { width: "min(480px, 100vw)" } });
  const body = el("div", { class: "drawer-body" });
  panel.append(body);
  root.append(backdrop, panel);
  function close() { panel.remove(); backdrop.remove(); }
  backdrop.onclick = close;
  body.append(build({ close }));
  return { close };
}
