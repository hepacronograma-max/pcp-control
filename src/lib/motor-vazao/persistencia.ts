/** Persistência dos inputs/resultado do motor em order_items. */

import type { MaterialFino } from "./tabelas-referencia";

export type MotorCamposSalvos = {
  motor_espessura_papel_mm: number | null;
  motor_material: MaterialFino | null;
  motor_tem_coroa: boolean | null;
  motor_num_elementos: number | null;
  motor_vazao: number | null;
  motor_dpi: number | null;
  motor_dpf: number | null;
};

export type ItemComMotor = {
  id: string;
  motor_espessura_papel_mm?: number | null;
  motor_material?: string | null;
  motor_tem_coroa?: boolean | null;
  motor_num_elementos?: number | null;
  motor_vazao?: number | null;
  motor_dpi?: number | null;
  motor_dpf?: number | null;
};

export function itemTemMotorSalvo(item: ItemComMotor | null | undefined): boolean {
  if (!item) return false;
  return (
    item.motor_espessura_papel_mm != null ||
    item.motor_material != null ||
    item.motor_tem_coroa != null ||
    item.motor_num_elementos != null ||
    item.motor_vazao != null
  );
}

export function patchMotorFromCalculo(params: {
  espessura_papel_mm?: number;
  material?: MaterialFino | "";
  tem_coroa?: boolean;
  num_elementos?: number;
  vazao: number;
  dPi: number;
  dPf: number;
}): MotorCamposSalvos {
  return {
    motor_espessura_papel_mm:
      params.espessura_papel_mm != null && Number.isFinite(params.espessura_papel_mm)
        ? Math.round(params.espessura_papel_mm)
        : null,
    motor_material: params.material || null,
    motor_tem_coroa:
      params.tem_coroa === undefined ? null : params.tem_coroa,
    motor_num_elementos:
      params.num_elementos != null && Number.isFinite(params.num_elementos)
        ? Math.round(params.num_elementos)
        : null,
    motor_vazao: Math.round(params.vazao),
    motor_dpi: Math.round(params.dPi),
    motor_dpf: Math.round(params.dPf),
  };
}
