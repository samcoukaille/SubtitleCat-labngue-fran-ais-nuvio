import { useState, useEffect, ReactNode } from 'react';
import { Download, ExternalLink, Info, ShieldCheck, Cat } from 'lucide-react';
import { motion } from 'motion/react';

export default function App() {
  const [manifestUrl, setManifestUrl] = useState('');
  const [isProtectedUrl, setIsProtectedUrl] = useState(false);
  const [isReady, setIsReady] = useState<boolean | null>(null);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);

  useEffect(() => {
    const origin = window.location.origin;
    // Use manifest.json as the primary path
    const url = origin + '/manifest.json';
    setIsProtectedUrl(origin.includes('ais-dev') || origin.includes('ais-pre'));
    // Use stremio:// protocol for the Install button - remove query param for stability
    const stremioUrl = url.replace(/^https?/, 'stremio');
    setManifestUrl(stremioUrl);

    fetch('/manifest.json')
      .then(r => setIsReady(r.ok))
      .catch(() => setIsReady(false));
  }, []);

  const handleInstall = () => {
    window.location.href = manifestUrl;
  };

  const testManifest = async () => {
    try {
      const res = await fetch('/manifest.json?v=' + Date.now());
      const text = await res.text();
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => { headers[k] = v; });
      
      setDebugInfo(JSON.stringify({
        status: res.status,
        statusText: res.statusText,
        headers,
        manifestId: JSON.parse(text).id,
        body: text.substring(0, 100) + '...'
      }, null, 2));
    } catch (err) {
      setDebugInfo('Error: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-indigo-500/30">
      <div className="max-w-4xl mx-auto px-6 py-20">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center space-y-8"
        >
          <div className="inline-flex items-center justify-center p-4 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 mb-4 relative">
            <Cat className="w-16 h-16 text-indigo-400" />
            {isReady !== null && (
              <div className="flex gap-2 absolute -top-3 -right-3">
                <div className="px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest border shadow-lg bg-indigo-500/20 border-indigo-500/40 text-indigo-400">
                  v73
                </div>
                <div className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest border shadow-lg ${isReady ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-rose-500/20 border-rose-500/40 text-rose-400'}`}>
                  {isReady ? '● Online' : '● Offline'}
                </div>
              </div>
            )}
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400">
            SubtitleCat Stremio Addon
          </h1>
          
          {isProtectedUrl && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-200 text-sm max-w-xl mx-auto flex items-start gap-3 text-left">
              <Info className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold mb-1">⚠️ Belangrijke waarschuwing</p>
                <p>Je gebruikt een <strong>Preview URL</strong>. Stremio kan deze URL vaak niet bereiken vanwege het Google Preview Splash-scherm of Vercel Deployment Protection.</p>
                <p className="mt-2 text-xs opacity-80">Oplossing: Gebruik de <strong>"Deploy to Cloud Run"</strong> optie of gebruik de <strong>Production URL</strong> in Vercel (zonder de willekeurige tekens in de naam).</p>
              </div>
            </div>
          )}
          
          <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Get high-quality subtitles directly from SubtitleCat.com in your Stremio player. 
            Supports movies and TV series in multiple languages.
          </p>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 mb-8 text-center max-w-2xl mx-auto">
            <p className="text-slate-400 text-sm">
              <span className="text-indigo-400 font-bold">Tip:</span> Het laden van een nieuwe NL vertaling kan tot <span className="text-white font-bold">20 seconden</span> duren. 
              Heb geduld nadat je de ondertiteling selecteert in Stremio.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
            <a
              href={manifestUrl}
              className="group relative px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full font-semibold text-lg transition-all hover:scale-105 active:scale-95 shadow-lg shadow-indigo-500/25 flex items-center gap-2"
            >
              <Download className="w-5 h-5 group-hover:bounce" />
              Install Addon
            </a>
            
            <button
              onClick={() => {
                navigator.clipboard.writeText(manifestUrl);
                alert('Stremio link gekopieerd naar klembord!');
              }}
              className="px-8 py-4 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-full font-semibold text-lg border border-slate-800 transition-all flex items-center gap-2"
            >
              Copy Stremio Link
            </button>
          </div>

          <div className="mt-8 flex flex-col items-center gap-4">
            <button 
              onClick={testManifest}
              className="text-xs text-slate-500 hover:text-slate-300 underline"
            >
              Test Manifest Connection
            </button>
            {debugInfo && (
              <p className="text-xs font-mono text-indigo-400 bg-black/40 p-2 rounded">
                {debugInfo}
              </p>
            )}
          </div>

          <div className="mt-12 p-6 bg-slate-900/30 rounded-2xl border border-slate-800 max-w-xl mx-auto">
            <p className="text-sm text-slate-500 mb-4 uppercase tracking-wider font-semibold text-left">Manual Installation</p>
            
            <div className="flex flex-col md:flex-row gap-6 items-center">
              <div className="flex-1 w-full">
                <code className="block w-full p-3 bg-black/40 rounded-lg text-indigo-400 break-all text-left border border-slate-800 font-mono text-sm mb-2">
                  {window.location.origin + '/manifest.json'}
                </code>
                <p className="text-[10px] text-slate-600 text-left italic">
                  Plak deze link in het zoekveld van de Stremio Addons sectie.
                </p>
              </div>
              
              <div className="p-2 bg-white rounded-lg shrink-0 shadow-xl shadow-indigo-500/10">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(window.location.origin + '/manifest.json')}`}
                  alt="QR Code voor installatie"
                  className="w-[120px] h-[120px]"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          </div>

          <div className="mt-8 p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl text-xs text-slate-500 text-left max-w-xl mx-auto">
            <h4 className="font-bold text-slate-400 mb-2 flex items-center gap-2">
              <Info className="w-4 h-4" /> Problemen met installeren?
            </h4>
            <ul className="list-disc list-inside space-y-1">
              <li className="text-rose-400 font-bold underline">BELANGRIJK: Controleer of je de manifest URL kunt openen in een INCognito/Privé venster. Als dat niet werkt, is de link niet openbaar en kan Stremio er niet bij.</li>
              <li>Gebruik de <strong>Stremio Desktop App</strong> in plaats van de webversie.</li>
              <li>Zorg dat je op de <strong>Shared App URL</strong> bent (niet de ais-dev link).</li>
              <li>Probeer de link handmatig te typen in Stremio als plakken niet werkt.</li>
              <li>Sommige browsers blokkeren de verbinding; probeer een andere browser.</li>
            </ul>
          </div>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 mt-32">
          <FeatureCard 
            icon={<ShieldCheck className="w-6 h-6 text-indigo-400" />}
            title="Safe & Secure"
            description="Direct links to subtitle files from SubtitleCat's official database."
          />
          <FeatureCard 
            icon={<Info className="w-6 h-6 text-indigo-400" />}
            title="Auto-Sync"
            description="Intelligent search matching based on IMDb metadata and release names."
          />
          <FeatureCard 
            icon={<Download className="w-6 h-6 text-indigo-400" />}
            title="Multi-Language"
            description="Access subtitles in Dutch, English, Spanish, French, and many more."
          />
        </div>

        <footer className="mt-32 pt-8 border-t border-slate-900 text-center text-slate-500 text-sm">
          <p>This is an unofficial addon. All subtitles are provided by subtitlecat.com</p>
        </footer>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: ReactNode, title: string, description: string }) {
  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className="p-8 bg-slate-900/50 rounded-3xl border border-slate-800/50 hover:border-indigo-500/30 transition-colors"
    >
      <div className="mb-4">{icon}</div>
      <h3 className="text-xl font-bold mb-2">{title}</h3>
      <p className="text-slate-400 leading-relaxed">{description}</p>
    </motion.div>
  );
}
