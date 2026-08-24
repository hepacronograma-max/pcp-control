export {
  isFamiliaAbsolutoCunha,
  isFamiliaFinoCunha,
  parseFamilia,
} from "./parse-familia";
export type {
  CampoFaltante,
  ClasseFiltro,
  FamiliaParseada,
  TipoMotor,
} from "./parse-familia";

export {
  TABELA_BOLSA,
  TABELA_CUNHA,
  TABELA_FINO,
} from "./tabelas-referencia";
export type {
  ClasseBolsa,
  LinhaBolsa,
  LinhaCunha,
  LinhaFino,
  MaterialFino,
} from "./tabelas-referencia";

export {
  materiaisFinoDisponiveis,
  espessurasFinoDisponiveis,
  coroasFinoDisponiveis,
  espessurasPlanoDisponiveis,
} from "./opcoes-fino";

export {
  itemTemMotorSalvo,
  patchMotorFromCalculo,
} from "./persistencia";
export type { MotorCamposSalvos, ItemComMotor } from "./persistencia";

export {
  escolherMaisProxima,
  encontrarLinhaFino,
  motorBolsa,
  motorCunha,
  motorFino,
  motorPlano,
} from "./motores";

export {
  calcularVazaoPressao,
  isPrecisaInputs,
  isResultadoCalculo,
} from "./calcular";
export type {
  CalculoMotorResult,
  InputsUsuarioMotor,
  ItemMotorInput,
  PrecisaInputsMotor,
  ResultadoCalculoMotor,
} from "./calcular";
