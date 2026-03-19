/**
 * PCP Control - Script de Exportação de Dados Locais
 * Fase 2 - Backup e Recuperação
 *
 * INSTRUÇÕES:
 * 1. Abra o PCP Control no navegador
 * 2. Pressione F12 → aba Console
 * 3. Copie e cole este script inteiro
 * 4. Pressione Enter
 * 5. O arquivo JSON será baixado automaticamente
 *
 * Este script NÃO altera nenhum dado existente.
 */

(function () {
  "use strict";

  const KEYS = {
    orders: "pcp-local-orders",
    lines: "pcp-local-lines",
    company: "pcp-local-company",
    profile: "pcp-local-profile",
    users: "pcp-local-users",
    holidays: "pcp-local-holidays",
  };

  function safeGet(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null || raw === "") return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function validateAndCollect(orders, lines, users, holidays) {
    const validation = {
      ordersCount: 0,
      itemsCount: 0,
      itemsWithProgramacao: 0,
      linesCount: 0,
      usersCount: 0,
      holidaysCount: 0,
      warnings: [],
      errors: [],
    };

    const lineIds = new Set((lines || []).map((l) => l.id));

    if (Array.isArray(orders)) {
      validation.ordersCount = orders.length;
      for (let i = 0; i < orders.length; i++) {
        const o = orders[i];
        if (!o || typeof o !== "object") {
          validation.errors.push("Pedido " + i + " inválido ou não é objeto");
          continue;
        }
        if (!o.id) validation.warnings.push("Pedido " + i + " sem id");
        if (!o.company_id) validation.warnings.push("Pedido " + i + " sem company_id");
        if (!o.order_number) validation.warnings.push("Pedido " + i + " sem order_number");
        if (!o.client_name) validation.warnings.push("Pedido " + i + " sem client_name");

        const items = o.items;
        if (Array.isArray(items)) {
          validation.itemsCount += items.length;
          for (let j = 0; j < items.length; j++) {
            const it = items[j];
            if (!it || typeof it !== "object") continue;
            if (!it.id) validation.warnings.push("Item " + j + " do pedido " + o.order_number + " sem id");
            if (!it.order_id && o.id) validation.warnings.push("Item " + j + " do pedido " + o.order_number + " sem order_id");
            if (it.line_id && !lineIds.has(it.line_id)) {
              validation.warnings.push("Item " + it.id + " referencia linha inexistente: " + it.line_id);
            }
            if (it.production_start || it.production_end || it.status === "scheduled" || it.status === "completed") {
              validation.itemsWithProgramacao += 1;
            }
          }
        } else {
          validation.warnings.push("Pedido " + (o.order_number || o.id) + " sem array items");
        }
      }
    }

    if (Array.isArray(lines)) {
      validation.linesCount = lines.length;
    }

    if (Array.isArray(users)) {
      validation.usersCount = users.length;
      for (let i = 0; i < users.length; i++) {
        const u = users[i];
        if (!u || typeof u !== "object") continue;
        const lineIdsUser = u.line_ids || [];
        for (let j = 0; j < lineIdsUser.length; j++) {
          if (!lineIds.has(lineIdsUser[j])) {
            validation.warnings.push("Usuário " + (u.email || u.id) + " referencia linha inexistente: " + lineIdsUser[j]);
          }
        }
      }
    }

    if (Array.isArray(holidays)) {
      validation.holidaysCount = holidays.length;
    }

    return validation;
  }

  function downloadJson(obj, filename) {
    const str = JSON.stringify(obj, null, 2);
    const blob = new Blob([str], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "pcp-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function run() {
    if (typeof localStorage === "undefined") {
      console.error("[PCP Backup] localStorage não disponível.");
      return;
    }

    console.log("[PCP Backup] Iniciando exportação...");

    const orders = safeGet(KEYS.orders);
    const lines = safeGet(KEYS.lines);
    const company = safeGet(KEYS.company);
    const profile = safeGet(KEYS.profile);
    const users = safeGet(KEYS.users);
    const holidays = safeGet(KEYS.holidays);

    const validation = validateAndCollect(orders, lines, users, holidays);

    const exportData = {
      exportedAt: new Date().toISOString(),
      origin: typeof window !== "undefined" && window.location ? window.location.origin : "unknown",
      version: "1.0",
      orders: orders || [],
      lines: lines || [],
      company: company || null,
      profile: profile || null,
      users: users || [],
      holidays: holidays || [],
      _validation: validation,
    };

    console.log("[PCP Backup] Resumo:");
    console.log("  - Pedidos:", validation.ordersCount);
    console.log("  - Itens (total):", validation.itemsCount);
    console.log("  - Itens com programação:", validation.itemsWithProgramacao);
    console.log("  - Linhas:", validation.linesCount);
    console.log("  - Usuários:", validation.usersCount);
    console.log("  - Feriados:", validation.holidaysCount);

    if (validation.warnings.length > 0) {
      console.warn("[PCP Backup] Avisos:", validation.warnings);
    }
    if (validation.errors.length > 0) {
      console.error("[PCP Backup] Erros:", validation.errors);
    }

    const filename = "pcp-backup-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".json";
    downloadJson(exportData, filename);

    console.log("[PCP Backup] Exportação concluída. Arquivo baixado:", filename);
  }

  if (typeof window !== "undefined") {
    window.__pcpExportLocalData = run;
  }
  run();
})();

/* Para executar novamente sem colar o script: window.__pcpExportLocalData() */
