// Encrypted business card viewer.
// card.enc = [version:1 byte][iv:12 bytes][AES-256-GCM ciphertext]
// plaintext = [json length: uint32 BE][json (UTF-8)][card image bytes]
// The 256-bit key comes from the URL fragment (#k=...), which browsers never send to the server.
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var SS_KEY = "card-key";

  function show(id) {
    ["stLoading", "stLocked", "stError", "card"].forEach(function (x) { $(x).hidden = x !== id; });
  }
  function b64urlDecode(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function getKey() {
    var k = new URLSearchParams(location.hash.slice(1)).get("k");
    if (k) {
      // Keep the key only for this tab (survives reload), and remove it from the address bar
      // so it is not shared if the visitor shares or bookmarks the page.
      try { sessionStorage.setItem(SS_KEY, k); } catch (e) {}
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
      return k;
    }
    try { return sessionStorage.getItem(SS_KEY); } catch (e) { return null; }
  }

  async function main() {
    $("host").textContent = location.host ? "Hosted at " + location.host : "";
    var k = getKey();
    if (!k) { show("stLocked"); return; }
    try {
      var raw = b64urlDecode(k);
      if (raw.length !== 32) throw new Error("bad key");
      var res = await fetch("card.enc", { cache: "no-store" });
      if (!res.ok) throw new Error("no file");
      var buf = new Uint8Array(await res.arrayBuffer());
      if (buf[0] !== 1) throw new Error("bad version");
      var key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
      var plain = new Uint8Array(await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: buf.slice(1, 13) }, key, buf.slice(13)));
      var len = new DataView(plain.buffer).getUint32(0);
      var data = JSON.parse(new TextDecoder().decode(plain.slice(4, 4 + len)));
      var img = new Blob([plain.slice(4 + len)], { type: data.imgType || "image/png" });
      render(data, img);
    } catch (e) {
      try { sessionStorage.removeItem(SS_KEY); } catch (x) {}
      show("stError");
    }
  }

  function render(C, imgBlob) {
    var setText = function (id, v) { var el = $(id); if (v) el.textContent = v; else el.remove(); };
    setText("nameEn", C.nameEn); setText("nameJa", C.nameJa); setText("title", C.title);
    setText("org", C.org); setText("lab", C.lab); setText("research", C.research);
    // The page title stays generic so the name never ends up in browser history.

    var imgUrl = URL.createObjectURL(imgBlob);
    $("cardImg").src = imgUrl;
    $("cardImg").alt = "Business card of " + (C.nameEn || "");
    var base = (C.nameEn || "card").replace(/[^\w.-]+/g, "_");
    var ext = /jpe?g/.test(imgBlob.type) ? "jpg" : "png";

    $("saveCard").addEventListener("click", function () {
      saveFile(new File([imgBlob], base + "_card." + ext, { type: imgBlob.type }),
        "Long-press the card image to save it. / 名刺画像を長押しして保存してください");
    });
    $("addContact").addEventListener("click", function () {
      saveFile(new File([buildVcard(C)], base + ".vcf", { type: "text/vcard" }),
        "Please use the Copy buttons below. / 下のCopyボタンをお使いください");
    });

    var list = $("links");
    var subject = encodeURIComponent("Nice to meet you" + (C.conference ? " at " + C.conference : ""));
    function row(label, value, buttons) {
      var r = document.createElement("div"); r.className = "row";
      var t = document.createElement("div"); t.className = "text";
      var l = document.createElement("div"); l.className = "label"; l.textContent = label;
      var v = document.createElement("div"); v.className = "value";
      value.split("@").forEach(function (part, i) {
        if (i) { v.appendChild(document.createTextNode("@")); v.appendChild(document.createElement("wbr")); }
        v.appendChild(document.createTextNode(part));
      });
      t.appendChild(l); t.appendChild(v); r.appendChild(t);
      var b = document.createElement("div"); b.className = "btns";
      buttons.forEach(function (x) { b.appendChild(x); });
      r.appendChild(b); list.appendChild(r);
    }
    function linkChip(text, href) {
      var a = document.createElement("a"); a.className = "chip"; a.textContent = text; a.href = href;
      if (/^https:/.test(href)) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
      return a;
    }
    function copyChip(value) {
      var b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.textContent = "Copy";
      b.addEventListener("click", function () {
        var done = function () { b.textContent = "Copied"; b.classList.add("done");
          setTimeout(function () { b.textContent = "Copy"; b.classList.remove("done"); }, 1600); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(value).then(done, function () { fallbackCopy(value); done(); });
        } else { fallbackCopy(value); done(); }
      });
      return b;
    }
    function mailRow(label, email) {
      if (email) row(label, email, [linkChip("Mail", "mailto:" + email + "?subject=" + subject), copyChip(email)]);
    }
    mailRow("Email (University) / 大学", C.emailUni);
    mailRow("Email (Permanent) / 卒業後も有効", C.emailPersonal);
    if (C.instagram) {
      var ig = C.instagram.replace(/^@/, "");
      row("Instagram", "@" + ig, [linkChip("Open", "https://www.instagram.com/" + encodeURIComponent(ig) + "/"), copyChip("@" + ig)]);
    }
    if (C.linkedin) row("LinkedIn", C.linkedin, [linkChip("Open", "https://www.linkedin.com/in/" + encodeURIComponent(C.linkedin) + "/")]);
    if (C.orcid) row("ORCID", C.orcid, [linkChip("Open", "https://orcid.org/" + encodeURIComponent(C.orcid))]);

    show("card");
  }

  // Share sheet on phones (iPhone: "Save Image" / Contacts), plain download elsewhere.
  function saveFile(file, failHint) {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file] }).catch(function (e) {
        if (e && e.name !== "AbortError") download(file);
      });
      return;
    }
    try { download(file); } catch (e) { $("saveHint").textContent = failHint; }
  }
  function download(file) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(file); a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
  }
  function fallbackCopy(value) {
    var ta = document.createElement("textarea"); ta.value = value; ta.setAttribute("readonly", "");
    ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta);
    ta.select(); ta.setSelectionRange(0, value.length);
    try { document.execCommand("copy"); } catch (e) {} ta.remove();
  }

  function esc(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); }
  function buildVcard(C) {
    var L = ["BEGIN:VCARD", "VERSION:3.0", "N:" + esc(C.familyEn) + ";" + esc(C.givenEn) + ";;;", "FN:" + esc(C.nameEn)];
    if (C.org) L.push("ORG:" + esc(C.org) + (C.lab ? ";" + esc(C.lab) : ""));
    if (C.title) L.push("TITLE:" + esc(C.title));
    if (C.emailUni) L.push("EMAIL;TYPE=INTERNET,WORK:" + C.emailUni);
    if (C.emailPersonal) L.push("EMAIL;TYPE=INTERNET,HOME:" + C.emailPersonal);
    var ig = (C.instagram || "").replace(/^@/, "");
    if (ig) L.push("X-SOCIALPROFILE;TYPE=instagram:https://www.instagram.com/" + ig + "/");
    if (C.linkedin) L.push("X-SOCIALPROFILE;TYPE=linkedin:https://www.linkedin.com/in/" + C.linkedin + "/");
    var note = [C.nameJa, C.conference && "Met at " + C.conference, C.research && "Research: " + C.research, C.orcid && "ORCID " + C.orcid].filter(Boolean);
    if (note.length) L.push("NOTE:" + esc(note.join(" / ")));
    L.push("END:VCARD");
    return L.join("\r\n") + "\r\n";
  }

  main();
})();
