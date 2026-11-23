import type {ClubContent} from './club-types';
import { themeDefaults } from './theme';
export const defaultClubLogo = '/power-punch-logo.webp';

export const defaults:ClubContent = {
 branding:{...themeDefaults,name:'Power Punch Club',tagline:'Karate Training',email:'',phone:'',whatsapp:'',address:'',instagram:'',facebook:'',map:'',logo:defaultClubLogo,hero:'/power-punch-banner.webp',heroPosition:'50% 65%',heroBackdropMode:'photo',heroBackdrop:'/hero-purple-background.webp',useHeroPattern:'true',trialFormId:'',enquiryFormId:'',accent:'#e63232',announcement:'For class timings and admission details, contact the club.',heroTitle:'Karate Training',heroText:'Power Punch Club · Vellore',about:'Power Punch Club provides karate training. Use this website to find class details, register for tournaments and view results.',seoTitle:'Power Punch Club | Karate & Martial Arts',seoDescription:'Find karate classes, tournament registration, results and contact details for Power Punch Club.'},
 training:[],
 masters:[], tournaments:[], achievements:[], gallery:[], announcements:[],
 forms:[{id:'default',title:'Participant details',fields:[{id:'age',label:'Age',type:'number',required:true,options:''},{id:'belt',label:'Belt level',type:'select',required:true,options:'White,Yellow,Orange,Green,Blue,Purple,Brown,Black'},{id:'academy',label:'Academy / club',type:'text',required:false,options:''}]}],
 pages:{aboutTitle:'About Power Punch Club',aboutText:'Read about the club and its karate training.',mission:'Help students learn karate, improve fitness and practise safely.',values:'Respect others. Stay focused. Practise regularly.',contactText:'Contact the club for class timings, admission details or tournament questions.',privacy:'We collect information you submit to process enquiries, registrations and payments. Payment details are handled by Razorpay. Contact the club to request access, correction or deletion of your personal information.',terms:'Training schedules, eligibility and tournament rules are set by the club. Registration is subject to review. Read the specific event details before making payment.',refund:'Contact the club for the applicable cancellation and refund policy before paying. Approved refunds are processed through the original payment method.'}
};
defaults.branding.registrationPrefix='PPC';
defaults.branding.registrationSuffix='';
export const contentKeys=Object.keys(defaults);
