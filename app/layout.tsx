import type { Metadata } from 'next';
import './globals.css';
import './rose-glass.css';
import './campaign.css';
import './mobile.css';
import './registration.css';
import './form-controls.css';
import './gallery-media.css';
export const metadata: Metadata={title:'Power Punch Club | Karate & Martial Arts',description:'Discipline. Strength. Character. Discover karate training and tournaments at Power Punch Club.',icons:{icon:'/power-punch-logo.webp'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
