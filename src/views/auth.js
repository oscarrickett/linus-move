import { el, clear, toast } from "../util.js";
import { signIn, signUp } from "../store.js";
import { ROLE_LABELS } from "../config.js";

export function renderAuth(root, onSignedIn) {
  clear(root);
  root.className = "auth-wrap";

  let mode = "signin"; // or 'signup'

  const card = el("div", { class: "auth-card" });
  root.append(card);
  paint();

  function paint() {
    clear(card);
    card.append(
      el("div", { class: "auth-brand" },
        el("div", { class: "brand-dot" }),
        el("div", { class: "brand-text" }, "Home Board"),
      ),
      el("h1", {}, mode === "signin" ? "Welcome back" : "Create your account"),
      el("p", {},
        mode === "signin"
          ? "Sign in to continue."
          : "Invite-only. Use the email your invite went to."
      ),
    );

    const emailInput = el("input", { class: "input", type: "email", placeholder: "email" });
    const pwInput    = el("input", { class: "input", type: "password", placeholder: "password", autocomplete: "current-password" });

    card.append(
      el("div", { class: "field" }, el("label", {}, "Email"), emailInput),
      el("div", { class: "field" }, el("label", {}, "Password"), pwInput),
    );

    let nameInput, roleSelect;
    if (mode === "signup") {
      nameInput  = el("input", { class: "input", type: "text", placeholder: "Your name" });
      roleSelect = el("select", { class: "select" },
        el("option", { value: "helper" }, ROLE_LABELS.helper),
        el("option", { value: "linus"  }, ROLE_LABELS.linus),
        el("option", { value: "family" }, ROLE_LABELS.family),
      );
      card.append(
        el("div", { class: "field" }, el("label", {}, "Display name"), nameInput),
        el("div", { class: "field" }, el("label", {}, "I am"), roleSelect),
      );
    }

    const submit = el("button", { class: "btn primary", style: { width: "100%", justifyContent: "center" } },
      mode === "signin" ? "Sign in" : "Create account");
    submit.onclick = async () => {
      submit.disabled = true;
      try {
        if (mode === "signin") {
          await signIn(emailInput.value.trim(), pwInput.value);
        } else {
          await signUp(emailInput.value.trim(), pwInput.value, nameInput.value.trim(), roleSelect.value);
          toast("Check your email if verification is required, then sign in.");
          mode = "signin"; paint(); return;
        }
        onSignedIn();
      } catch (err) {
        toast(err.message || "Something went wrong", "error");
      } finally { submit.disabled = false; }
    };

    const toggle = el("button", { class: "linky", style: { marginTop: "12px" } },
      mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in");
    toggle.onclick = () => { mode = mode === "signin" ? "signup" : "signin"; paint(); };

    card.append(submit, el("div", { style: { textAlign: "center" } }, toggle));
  }
}
