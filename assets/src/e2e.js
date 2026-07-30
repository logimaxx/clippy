/* Webklip E2E — AES-256-GCM with passphrase-wrapped DEK (true E2E).
 * Legacy: still accepts #key= for old links.
 */
(function () {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const PBKDF2_ITERS = 600000;
  const SALT_BYTES = 16;
  const DEK_BYTES = 32;
  const IV_BYTES = 12;
  const WORD_COUNT = 4;

  // Compact memorable wordlist (~256 words) for auto-generated phrases.
  const WORDS = [
    "able","acid","acre","aged","also","army","away","back","ball","band","bank","base","bath","bear","beat","been",
    "bell","belt","best","bike","bill","bird","blow","blue","boat","body","bomb","bond","bone","book","boom","born",
    "boss","both","bowl","bulk","burn","bush","busy","cage","cake","call","calm","came","camp","card","care","case",
    "cash","cast","cave","cell","chat","chip","city","clap","clay","clip","club","coal","coat","code","coil","cold",
    "come","cook","cool","cope","copy","core","cork","cost","crab","crew","crop","crow","cube","cult","curb","cure",
    "curl","cute","damp","dare","dark","dart","dash","data","date","dawn","days","dead","deal","dear","deck","deep",
    "deer","desk","dial","diet","dirt","disc","dish","disk","dock","does","dome","done","door","dose","down","draw",
    "drew","drip","drop","drum","dual","duck","duel","duke","dusk","dust","duty","each","earn","ease","east","easy",
    "edge","else","even","ever","evil","exam","exit","face","fact","fail","fair","fall","farm","fast","fate","fear",
    "feed","feel","feet","fell","felt","file","fill","film","find","fine","fire","firm","fish","five","flag","flat",
    "flew","flow","foam","fold","folk","food","foot","ford","fork","form","fort","four","free","frog","from","fuel",
    "full","fund","fuse","gain","game","gang","gate","gave","gear","gift","girl","give","glad","glow","glue","goal",
    "goat","goes","gold","golf","gone","good","gown","grab","gray","grew","grid","grin","grip","grow","gulf","hair",
    "half","hall","hand","hang","hard","harm","harp","hate","have","head","heal","heap","hear","heat","heed","heel",
    "held","hell","help","herb","here","hero","hide","high","hill","hind","hint","hire","hold","hole","holy","home",
    "hope","horn","host","hour","huge","hull","hung","hunt","hurt","idea","idle","inch","into","iron","item","jack",
    "jade","jail","jazz","join","joke","jump","june","jury","just","keen","keep","kept","kick","kill","kind","king",
    "kiss","kite","knee","knew","knit","knob","knot","know","lace","lack","lady","laid","lake","lamp","land","lane",
    "last","late","lava","lawn","lazy","lead","leaf","lean","leap","left","lend","lens","less","liar","life","lift",
    "like","limb","lime","line","link","lion","list","live","load","loan","lock","logo","long","look","loop","lord",
    "lose","loss","lost","loud","love","luck","lung","lure","lurk","lush","mace","made","maid","mail","main","make",
    "male","mall","many","mark","mars","mask","mass","mate","math","meal","mean","meat","meet","melt","memo","menu",
    "mere","mesh","mess","mild","mile","milk","mill","mind","mine","mint","miss","mist","moat","mode","mood","moon",
    "more","most","move","much","must","myth","nail","name","navy","near","neck","need","nest","news","next","nice",
    "nine","node","none","noon","norm","nose","note","noun","oak","oath","obey","odds","odor","okay","once","only",
    "onto","open","oral","other","oval","oven","over","pace","pack","page","paid","pain","pair","pale","palm","park",
    "part","pass","past","path","peak","peat","peel","peer","pick","pier","pile","pine","pink","pipe","plan","play",
    "plot","plug","plus","poem","poet","pole","poll","pond","pool","poor","port","pose","post","pour","pray","pull",
    "pulp","pump","pure","push","quit","race","rack","raft","rage","raid","rail","rain","rake","ramp","rank","rare",
    "rate","read","real","ream","rear","reed","reef","rely","rent","rest","rice","rich","ride","ring","riot","rise",
    "risk","road","roam","roar","robe","rock","rode","role","roll","roof","room","root","rope","rose","ruby","ruin",
    "rule","rush","rust","safe","sage","said","sail","sake","sale","salt","same","sand","sane","save","seal","seat",
    "seed","seek","seem","self","sell","send","shed","ship","shop","shot","show","shut","side","sign","silk","sing",
    "sink","site","size","skin","skip","slab","slam","slid","slim","slip","slot","slow","snap","snow","soak","soap",
    "soft","soil","sold","sole","some","song","soon","sore","sort","soul","soup","span","spin","spot","star","stay",
    "stem","step","stew","stir","stop","such","suit","sure","swan","swap","swim","tail","take","tale","talk","tall",
    "tank","tape","task","team","tear","tell","tend","tent","term","test","text","than","that","them","then","they",
    "thin","this","thus","tide","tile","time","tiny","tire","toad","tone","took","tool","tops","torn","tour","town",
    "trap","tray","tree","trim","trip","true","tube","tune","turn","twin","type","ugly","undo","unit","upon","urge",
    "used","user","vain","vary","vast","veil","vein","vent","verb","very","vest","veto","vice","view","vine","visa",
    "void","volt","vote","wage","wait","wake","walk","wall","want","ward","warm","warn","wash","wave","ways","weak",
    "wear","weed","week","well","went","were","west","what","when","whip","whom","wide","wife","wild","will","wind",
    "wine","wing","wire","wise","wish","with","wolf","wood","wool","word","wore","work","worm","worn","wrap","yard",
    "yarn","year","your","zeal","zero","zest","zone","zoom",
  ];

  function b64UrlToBytes(b64url) {
    let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    if (pad) b64 += "=".repeat(4 - pad);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function bytesToB64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function isLikelyCiphertext(value) {
    const trimmed = value.trim();
    return trimmed.length >= 28 && /^[A-Za-z0-9_-]+$/.test(trimmed);
  }

  function isWeakPassphrase(passphrase) {
    const t = String(passphrase || "").trim();
    if (t.length < 8) return true;
    if (/^\d+$/.test(t)) return true;
    return false;
  }

  function slugFromPage() {
    const ta = document.getElementById("clip-content");
    return ta?.dataset?.wsRoom || location.pathname.replace(/^\//, "").split("/")[0] || "";
  }

  function dekStorageKey(slug) {
    return `webklip_dek_${slug}`;
  }

  function passStorageKey(slug) {
    return `webklip_pass_${slug}`;
  }

  function readSessionDek(slug) {
    try {
      const raw = sessionStorage.getItem(dekStorageKey(slug));
      if (!raw) return null;
      const bytes = b64UrlToBytes(raw);
      return bytes.length === DEK_BYTES ? bytes : null;
    } catch {
      return null;
    }
  }

  function writeSessionDek(slug, dek, passphrase) {
    try {
      sessionStorage.setItem(dekStorageKey(slug), bytesToB64(dek));
      if (passphrase != null) {
        sessionStorage.setItem(passStorageKey(slug), passphrase);
      }
    } catch {
      /* private mode */
    }
  }

  function clearSession(slug) {
    try {
      sessionStorage.removeItem(dekStorageKey(slug));
      sessionStorage.removeItem(passStorageKey(slug));
    } catch {
      /* ignore */
    }
  }

  function keyFromHash() {
    const m = location.hash.match(/#key=([A-Za-z0-9_-]+)/);
    if (!m) return null;
    try {
      const bytes = b64UrlToBytes(m[1]);
      return bytes.length === DEK_BYTES ? bytes : null;
    } catch {
      return null;
    }
  }

  function readE2eMeta() {
    const ta = document.getElementById("clip-content");
    if (!ta) return null;
    const salt = ta.dataset.e2eSalt || "";
    const wrapped = ta.dataset.e2eWrappedKey || "";
    const kdfRaw = ta.dataset.e2eKdf || "";
    if (!salt || !wrapped) return null;
    let kdf = { alg: "PBKDF2", hash: "SHA-256", iters: PBKDF2_ITERS };
    if (kdfRaw) {
      try {
        kdf = { ...kdf, ...JSON.parse(kdfRaw) };
      } catch {
        /* keep defaults */
      }
    }
    return { salt, wrapped, kdf };
  }

  async function importAesKey(raw, usages) {
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, usages);
  }

  async function deriveKek(passphrase, salt, iters) {
    const base = await crypto.subtle.importKey(
      "raw",
      encoder.encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: iters,
        hash: "SHA-256",
      },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function wrapDek(dek, kek) {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, kek, dek);
    const out = new Uint8Array(iv.length + ct.byteLength);
    out.set(iv, 0);
    out.set(new Uint8Array(ct), iv.length);
    return bytesToB64(out);
  }

  async function unwrapDek(wrappedB64, kek) {
    const data = b64UrlToBytes(wrappedB64);
    if (data.length < IV_BYTES + 16) throw new Error("Wrapped key too short");
    const iv = data.slice(0, IV_BYTES);
    const ct = data.slice(IV_BYTES);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, kek, ct);
    return new Uint8Array(pt);
  }

  async function encrypt(plaintext, keyBytes) {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const key = await importAesKey(keyBytes, ["encrypt"]);
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(plaintext)
    );
    const out = new Uint8Array(iv.length + ct.byteLength);
    out.set(iv, 0);
    out.set(new Uint8Array(ct), iv.length);
    return bytesToB64(out);
  }

  async function decrypt(payload, keyBytes) {
    const data = b64UrlToBytes(payload.trim());
    if (data.length < IV_BYTES + 1) throw new Error("Ciphertext too short");
    const iv = data.slice(0, IV_BYTES);
    const ct = data.slice(IV_BYTES);
    const key = await importAesKey(keyBytes, ["decrypt"]);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return decoder.decode(pt);
  }

  function generateMemorablePhrase() {
    const words = [];
    const buf = crypto.getRandomValues(new Uint32Array(WORD_COUNT));
    for (let i = 0; i < WORD_COUNT; i++) {
      words.push(WORDS[buf[i] % WORDS.length]);
    }
    return words.join("-");
  }

  function getActiveDek() {
    const legacy = keyFromHash();
    if (legacy) return legacy;
    return readSessionDek(slugFromPage());
  }

  async function enablePassphraseProtection(passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const dek = crypto.getRandomValues(new Uint8Array(DEK_BYTES));
    const kdf = { alg: "PBKDF2", hash: "SHA-256", iters: PBKDF2_ITERS };
    const kek = await deriveKek(passphrase, salt, kdf.iters);
    const wrappedKeyB64 = await wrapDek(dek, kek);
    return {
      saltB64: bytesToB64(salt),
      wrappedKeyB64,
      kdf,
      dek,
    };
  }

  async function unlockWithPassphrase(passphrase) {
    const meta = readE2eMeta();
    if (!meta) throw new Error("Missing E2E metadata");
    const salt = b64UrlToBytes(meta.salt);
    const kek = await deriveKek(passphrase, salt, meta.kdf.iters || PBKDF2_ITERS);
    const dek = await unwrapDek(meta.wrapped, kek);
    const slug = slugFromPage();
    writeSessionDek(slug, dek, passphrase);
    return dek;
  }

  function hidePassphraseGate() {
    const gate = document.getElementById("e2e-passphrase-gate");
    if (gate) gate.hidden = true;
    document.body.style.overflow = "";
  }

  function showPassphraseGate(opts = {}) {
    const gate = document.getElementById("e2e-passphrase-gate");
    if (!gate) return;
    const err = gate.querySelector("[data-e2e-gate-error]");
    if (err) {
      err.textContent = opts.error || "";
      err.hidden = !opts.error;
    }
    gate.hidden = false;
    document.body.style.overflow = "hidden";
    const input = gate.querySelector('input[name="e2e-passphrase"]');
    if (input instanceof HTMLInputElement) {
      input.value = "";
      input.focus();
    }
  }

  async function applyDecryptedToEditor(plaintext) {
    const ta = document.getElementById("clip-content");
    if (!ta) return;
    ta.dataset.decrypted = "true";
    ta.disabled = false;
    const wrap = document.getElementById("clip-editor-wrap");
    if (wrap) wrap.dataset.decrypted = "true";
    if (window.WebklipWorkspace?.loadPlaintext) {
      window.WebklipWorkspace.loadPlaintext(plaintext);
    } else {
      ta.value = plaintext;
      window.WebklipEditor?.refresh?.();
    }
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function initClipDecrypt() {
    const ta = document.getElementById("clip-content");
    if (!ta || ta.dataset.encrypted !== "true") return;

    const slug = slugFromPage();
    let dek = getActiveDek();

    if (!dek && readE2eMeta()) {
      ta.placeholder = "Enter passphrase to decrypt";
      ta.disabled = true;
      showPassphraseGate();
      return;
    }

    if (!dek) {
      ta.placeholder =
        "Enter passphrase to decrypt, or open a legacy link with #key=…";
      ta.disabled = true;
      if (readE2eMeta() || ta.dataset.e2eSalt === undefined) {
        showPassphraseGate({
          error: readE2eMeta()
            ? ""
            : "This clip needs a passphrase, or a legacy URL with #key=.",
        });
      }
      return;
    }

    const stored = ta.value.trim();
    if (!stored) {
      ta.dataset.decrypted = "true";
      ta.disabled = false;
      hidePassphraseGate();
      return;
    }

    if (!isLikelyCiphertext(stored)) {
      ta.dataset.decrypted = "true";
      ta.disabled = false;
      hidePassphraseGate();
      if (stored) ta.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    try {
      const plain = await decrypt(stored, dek);
      await applyDecryptedToEditor(plain);
      hidePassphraseGate();
      if (slug && !readSessionDek(slug) && keyFromHash()) {
        writeSessionDek(slug, dek, null);
      }
    } catch {
      ta.value = "";
      ta.placeholder = "Wrong passphrase or key";
      ta.disabled = true;
      clearSession(slug);
      if (readE2eMeta()) showPassphraseGate({ error: "Wrong passphrase" });
    }
  }

  function bindGateUi() {
    const gate = document.getElementById("e2e-passphrase-gate");
    if (!gate || gate.dataset.bound === "true") return;
    gate.dataset.bound = "true";

    const form = gate.querySelector("form") || gate;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = gate.querySelector('input[name="e2e-passphrase"]');
      if (!(input instanceof HTMLInputElement)) return;
      const passphrase = input.value;
      if (!passphrase) return;
      const btn = gate.querySelector('button[type="submit"]');
      if (btn instanceof HTMLButtonElement) btn.disabled = true;
      try {
        await unlockWithPassphrase(passphrase);
        const ta = document.getElementById("clip-content");
        const stored = ta?.value?.trim() || "";
        if (stored && isLikelyCiphertext(stored)) {
          const plain = await window.WebklipE2E.decrypt(stored);
          await applyDecryptedToEditor(plain);
        } else {
          await applyDecryptedToEditor(stored);
        }
        hidePassphraseGate();
      } catch {
        showPassphraseGate({ error: "Wrong passphrase" });
      } finally {
        if (btn instanceof HTMLButtonElement) btn.disabled = false;
      }
    });
  }

  window.WebklipE2E = {
    hasKey() {
      return !!getActiveDek();
    },
    getKeyBytes() {
      return getActiveDek();
    },
    isLikelyCiphertext,
    isWeakPassphrase,
    generateMemorablePhrase,
    enablePassphraseProtection,
    unlockWithPassphrase,
    writeSessionDek,
    clearSession,
    readSessionPassphrase(slug) {
      try {
        return sessionStorage.getItem(passStorageKey(slug || slugFromPage()));
      } catch {
        return null;
      }
    },
    showPassphraseGate,
    hidePassphraseGate,
    async encrypt(plaintext) {
      const k = getActiveDek();
      if (!k) throw new Error("No E2E key unlocked");
      return encrypt(plaintext, k);
    },
    async decrypt(ciphertext) {
      const k = getActiveDek();
      if (!k) throw new Error("No E2E key unlocked");
      return decrypt(ciphertext, k);
    },
    /** @deprecated legacy #key= helper */
    enableEncryption() {
      const raw = crypto.getRandomValues(new Uint8Array(DEK_BYTES));
      const b64 = bytesToB64(raw);
      history.replaceState(
        null,
        "",
        location.pathname + location.search + "#key=" + b64
      );
      writeSessionDek(slugFromPage(), raw, null);
      return b64;
    },
    shareUrl() {
      return location.href.split("#")[0];
    },
    initClipDecrypt,
  };

  bindGateUi();
  window.WebklipE2EDecryptReady = initClipDecrypt();
})();
