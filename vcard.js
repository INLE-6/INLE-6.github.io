// Builds the contact card (vCard 3.0). lang: "ja" = Japanese only, "en" = English only.
// Used by the card page (Add to Contacts) and by setup.html (offline contact QR).
(function () {
  "use strict";
  function esc(s) {
    return String(s || "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  }
  function or(a, b) { return a || b || ""; }

  window.buildVcard = function (C, lang) {
    var ja = lang === "ja";
    var ig = (C.instagram || "").replace(/^@/, "");
    var L = ["BEGIN:VCARD", "VERSION:3.0"];

    if (ja) {
      L.push("N:" + esc(or(C.familyJa, C.familyEn)) + ";" + esc(or(C.givenJa, C.givenEn)) + ";;;");
      L.push("FN:" + esc(or(C.nameJa, C.nameEn)));
      if (C.familyKana) L.push("X-PHONETIC-LAST-NAME:" + esc(C.familyKana));
      if (C.givenKana) L.push("X-PHONETIC-FIRST-NAME:" + esc(C.givenKana));
    } else {
      L.push("N:" + esc(C.familyEn) + ";" + esc(C.givenEn) + ";;;");
      L.push("FN:" + esc(C.nameEn));
    }

    var org = ja ? or(C.orgJa, C.org) : C.org;
    var lab = ja ? or(C.labJa, C.lab) : C.lab;
    var title = ja ? or(C.titleJa, C.title) : C.title;
    if (org) L.push("ORG:" + esc(org) + (lab ? ";" + esc(lab) : ""));
    if (title) L.push("TITLE:" + esc(title));
    if (C.emailUni) L.push("EMAIL;TYPE=INTERNET,WORK:" + C.emailUni);
    if (C.emailPersonal) L.push("EMAIL;TYPE=INTERNET,HOME:" + C.emailPersonal);
    if (ig) L.push("X-SOCIALPROFILE;TYPE=instagram:https://www.instagram.com/" + ig + "/");

    // Memo: one item per line, no repetition of name/title.
    var note = [];
    if (ja) {
      var conf = or(C.conferenceJa, C.conference);
      if (conf) note.push(conf + "でお会いしました");
      var res = or(C.researchJa, C.research);
      if (res) note.push("研究テーマ：" + res);
      if (C.emailPersonal) note.push("Gmailは卒業後も使えます");
      if (ig) note.push("Instagram：" + (or(C.instagramClubJa, C.instagramClub) ? "サークル「" + or(C.instagramClubJa, C.instagramClub) + "」のアカウント" : "@" + ig));
    } else {
      if (C.conference) note.push("Met at " + C.conference);
      if (C.research) note.push("Research: " + C.research);
      if (C.emailPersonal) note.push("Gmail stays valid after graduation");
      if (ig) note.push("Instagram: " + (C.instagramClub ? "account of my club, " + C.instagramClub : "@" + ig));
    }
    if (note.length) L.push("NOTE:" + esc(note.join("\n")));

    L.push("END:VCARD");
    return L.join("\r\n") + "\r\n";
  };
})();
