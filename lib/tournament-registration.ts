export type RegistrationChoice = 'paid' | 'free' | 'manual';

export const registrationModes = ['auto', 'paid', 'free', 'both', 'manual', 'disabled'] as const;

export function registrationChoices(event: { registrationMode?: string; fee?: number; manualPaymentEnabled?: boolean; presentationOnly?:boolean }): RegistrationChoice[] {
  // Authorized presentation content may use the existing manual-proof workflow,
  // but must never open a real online checkout, even when live keys are present.
  if(event.presentationOnly)return event.registrationMode==='disabled'||!event.manualPaymentEnabled?[]:['manual'];
  let choices: RegistrationChoice[];
  switch (event.registrationMode) {
    case 'paid': choices = ['paid']; break;
    case 'free': choices = ['free']; break;
    case 'both': choices = ['paid', 'free']; break;
    case 'manual': return ['manual'];
    case 'disabled': return [];
    default: choices = Number(event.fee) > 0 ? ['paid'] : ['free'];
  }
  if (event.manualPaymentEnabled === true) choices.push('manual');
  return choices;
}

export function registrationSerial(id: string, prefix = 'PPC-REG-', suffix = '') {
  return prefix + id + suffix;
}
