export type RegistrationChoice = 'paid' | 'free' | 'manual';

export const registrationModes = ['auto', 'paid', 'free', 'both', 'manual', 'disabled'] as const;

export function registrationChoices(event: { registrationMode?: string; fee?: number; manualPaymentEnabled?: boolean }): RegistrationChoice[] {
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
