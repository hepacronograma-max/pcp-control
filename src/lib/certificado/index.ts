export {
  INSTRUMENTO_TESTE,
  GERADOR_AEROSSOL,
  APROVADORES,
  ELABORADORES,
  ELABORADOR_PADRAO,
  pathAssinatura,
} from "./dados-fixos";

export {
  TEMPLATE_A,
  TEMPLATE_B,
  TEMPLATE_C,
  TEMPLATE_D,
  templatePorTipo,
  normaDoTemplate,
  textoClasseComNorma,
  NORMA_ABSOLUTO,
  NORMA_FINO_BOLSA_GROSSO,
  toleranciaChecklist,
  textoVazaoPressaoCertificado,
  textoEficiencia,
  criterioChecklist,
  type TipoCertificado,
  type FamiliaCertificado,
  type ChecklistItem,
  type TemplateCertificado,
} from "./templates";

export {
  rotearCertificado,
  FOTO_PATH,
  LOGO_HEPA_PATH,
  type FotoCertificado,
  type RoteamentoCertificado,
} from "./roteador";

export {
  gerarCertificadoPdf,
  gerarCertificadosSeries,
  carregarAssetsCertificado,
  downloadBlob,
  openBlobInNewTab,
  CERT_PDF_LAYOUT,
  type CertificadoItemInput,
  type CertificadoPdfParams,
} from "./gerar-pdf";
