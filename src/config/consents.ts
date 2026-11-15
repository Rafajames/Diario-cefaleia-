import type { ConsentType } from '@/types/database'

/**
 * Resumos dos termos de consentimento.
 * ATENÇÃO: são MINUTAS técnicas. O texto jurídico definitivo deve ser redigido/revisado pelo
 * responsável jurídico e pelo encarregado (DPO) da CENDOR antes do uso com dados reais.
 * Ao alterar um texto, incremente a versão em app_settings.consent_versions.
 */
export const CONSENT_TEXT: Record<ConsentType, { title: string; summary: string; required: boolean }> = {
  personal_data: {
    title: 'Tratamento de dados pessoais',
    summary: 'Autorizo o tratamento dos meus dados de identificação e contato para criar e manter minha conta no Diário da Cefaleia.',
    required: true,
  },
  health_data: {
    title: 'Tratamento de dados sensíveis de saúde',
    summary: 'Autorizo o tratamento dos dados de saúde que eu registrar (crises, sintomas, medicamentos, ciclo menstrual e hábitos) com a finalidade de acompanhar a minha cefaleia.',
    required: true,
  },
  professional_sharing: {
    title: 'Compartilhamento com profissionais autorizados',
    summary: 'Autorizo que os profissionais que eu escolher e vincular à minha conta consultem meus registros. Posso revogar cada vínculo a qualquer momento. Todo acesso fica registrado e visível para mim.',
    required: false,
  },
  research: {
    title: 'Uso em estatísticas e pesquisa (opcional)',
    summary: 'Autorizo o uso dos meus dados, de forma anonimizada e agregada, em estatísticas e estudos. Recusar não afeta em nada o uso do diário.',
    required: false,
  },
}
export const CONSENT_ORDER: ConsentType[] = ['personal_data', 'health_data', 'professional_sharing', 'research']
