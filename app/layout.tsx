import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'Tanishka Pathways | Your visa. Our priority.',description:'Visa guidance for study, work, visitor and family pathways, with a secure internal team workspace.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
