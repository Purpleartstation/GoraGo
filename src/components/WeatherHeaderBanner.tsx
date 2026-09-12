import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { UserCircle, RefreshCw, MapPin, Sparkles } from 'lucide-react';
import type { User } from '../db';

export interface WeatherInfo {
  temp: number;
  weatherCode: number;
  condition: string;
  icon: string;
  category: 'clear-day' | 'clear-night' | 'cloudy' | 'drizzle' | 'rain' | 'thunderstorm' | 'snow' | 'fog';
  isDay: boolean;
  locationName?: string;
}

interface WeatherHeaderBannerProps {
  user: User | null;
  onOpenSettings: () => void;
}

export function parseWMO(code: number, isDay: boolean): { condition: string; icon: string; category: WeatherInfo['category'] } {
  // 0: Clear sky
  if (code === 0) {
    return isDay
      ? { condition: 'Sunny', icon: '☀️', category: 'clear-day' }
      : { condition: 'Clear', icon: '🌙', category: 'clear-night' };
  }
  // 1, 2, 3: Mainly clear, partly cloudy, overcast
  if (code >= 1 && code <= 3) {
    if (code === 1) return { condition: 'Mainly Clear', icon: isDay ? '🌤️' : '🌙', category: isDay ? 'clear-day' : 'clear-night' };
    if (code === 2) return { condition: 'Partly Cloudy', icon: isDay ? '⛅' : '☁️', category: 'cloudy' };
    return { condition: 'Overcast', icon: '☁️', category: 'cloudy' };
  }
  // 45, 48: Fog
  if (code === 45 || code === 48) {
    return { condition: 'Foggy', icon: '🌫️', category: 'fog' };
  }
  // 51, 53, 55, 56, 57: Drizzle
  if (code >= 51 && code <= 57) {
    return { condition: 'Light Drizzle', icon: '🌦️', category: 'drizzle' };
  }
  // 61, 63, 65, 66, 67, 80, 81, 82: Rain / Shower
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    if (code === 65 || code === 82) return { condition: 'Heavy Rain', icon: '🌧️', category: 'rain' };
    return { condition: 'Rainy', icon: '🌧️', category: 'rain' };
  }
  // 71, 73, 75, 77, 85, 86: Snow
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
    return { condition: 'Snowy', icon: '❄️', category: 'snow' };
  }
  // 95, 96, 99: Thunderstorm
  if (code >= 95) {
    return { condition: 'Thunderstorm', icon: '⛈️', category: 'thunderstorm' };
  }

  return isDay
    ? { condition: 'Clear', icon: '☀️', category: 'clear-day' }
    : { condition: 'Clear', icon: '🌙', category: 'clear-night' };
}

export function getGreeting(userName?: string): string {
  const now = new Date();
  const hours = now.getHours();
  const mins = now.getMinutes();
  const name = userName && userName.trim() ? userName.trim() : 'User';

  let greetingPrefix = 'Good Morning';

  if (hours >= 5 && hours < 12) {
    greetingPrefix = 'Good Morning';
  } else if (hours >= 12 && hours <= 17) {
    if (hours === 17 && mins > 0) {
      greetingPrefix = 'Good Evening';
    } else {
      greetingPrefix = 'Good Afternoon';
    }
  } else {
    greetingPrefix = 'Good Evening';
  }

  return `${greetingPrefix}, ${name}`;
}

/**
 * GPU-accelerated atmospheric background overlay representing real-time weather
 */
function AtmosphericWeatherOverlay({ category }: { category: WeatherInfo['category']; isDay: boolean }) {
  // Generate random static positions for rain drops, stars, snow
  const starList = useMemo(() => {
    return Array.from({ length: 22 }).map((_, i) => ({
      id: i,
      top: `${Math.floor(Math.random() * 80 + 5)}%`,
      left: `${Math.floor(Math.random() * 90 + 5)}%`,
      duration: 1.4 + (i % 5) * 0.4,
      delay: (i % 7) * 0.25,
      size: i % 3 === 0 ? 'w-1.5 h-1.5' : 'w-1 h-1',
    }));
  }, []);

  const rainList = useMemo(() => {
    return Array.from({ length: 24 }).map((_, i) => ({
      id: i,
      left: `${(i * 4.2 + Math.random() * 3) % 100}%`,
      duration: 0.45 + (i % 4) * 0.12,
      delay: (i % 6) * 0.08,
      height: 22 + (i % 3) * 10,
    }));
  }, []);

  const snowList = useMemo(() => {
    return Array.from({ length: 18 }).map((_, i) => ({
      id: i,
      left: `${(i * 5.5 + Math.random() * 3) % 100}%`,
      duration: 2.8 + (i % 4) * 0.7,
      delay: (i % 5) * 0.35,
    }));
  }, []);

  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none rounded-3xl transition-all duration-700">
      {/* --- Clear Day --- */}
      {category === 'clear-day' && (
        <div className="absolute inset-0 bg-gradient-to-br from-amber-200/50 via-sky-300/40 to-blue-500/30 dark:from-amber-600/25 dark:via-sky-600/30 dark:to-indigo-900/40 transition-colors duration-700">
          {/* Subtle Glowing Sun Rays */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 40, ease: 'linear' }}
            className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-[radial-gradient(circle,rgba(251,191,36,0.35)_0%,transparent_70%)] blur-xl transform-gpu will-change-transform pointer-events-none"
          />

          {/* Glowing Sun Disk */}
          <motion.div
            animate={{ scale: [1, 1.1, 1], opacity: [0.75, 0.95, 0.75] }}
            transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
            className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-gradient-to-br from-amber-300/80 to-orange-400/50 blur-2xl transform-gpu will-change-transform"
          />

          {/* Drifting Soft White Clouds */}
          <motion.div
            animate={{ x: ['-20%', '115%'] }}
            transition={{ repeat: Infinity, duration: 22, ease: 'linear' }}
            className="absolute top-2 w-36 h-10 bg-white/60 dark:bg-white/25 rounded-full blur-md shadow-xs transform-gpu will-change-transform"
          />
          <motion.div
            animate={{ x: ['-35%', '120%'] }}
            transition={{ repeat: Infinity, duration: 30, ease: 'linear', delay: 8 }}
            className="absolute top-6 w-44 h-12 bg-white/45 dark:bg-white/15 rounded-full blur-lg shadow-xs transform-gpu will-change-transform"
          />
        </div>
      )}

      {/* --- Clear Night --- */}
      {category === 'clear-night' && (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-indigo-950 to-zinc-900 dark:from-black dark:via-slate-950 dark:to-indigo-950 transition-colors duration-700">
          {/* Crescent Moon Glow */}
          <div className="absolute top-3 right-12 w-10 h-10 rounded-full bg-slate-950/90 shadow-[inset_-4px_3px_0_0_#fef08a] filter drop-shadow-[0_0_12px_rgba(254,240,138,0.7)] transform-gpu" />
          <div className="absolute top-0 right-10 w-16 h-16 rounded-full bg-amber-100/15 blur-xl transform-gpu" />

          {/* Twinkling Star Field */}
          {starList.map((star) => (
            <motion.div
              key={star.id}
              style={{ top: star.top, left: star.left }}
              animate={{ opacity: [0.15, 0.95, 0.15], scale: [0.8, 1.3, 0.8] }}
              transition={{ repeat: Infinity, duration: star.duration, delay: star.delay, ease: 'easeInOut' }}
              className={`absolute bg-white rounded-full ${star.size} transform-gpu will-change-transform shadow-[0_0_4px_rgba(255,255,255,0.8)]`}
            />
          ))}
        </div>
      )}

      {/* --- Rainy / Drizzle --- */}
      {(category === 'rain' || category === 'drizzle') && (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/90 via-slate-800/85 to-zinc-900/90 dark:from-slate-950 dark:via-zinc-900 dark:to-slate-900 transition-colors duration-700">
          {/* Drifting Dark Clouds */}
          <div className="absolute -top-10 inset-x-0 h-28 bg-slate-800/70 dark:bg-slate-900/85 blur-xl transform-gpu" />

          {/* Falling Rain Streaks */}
          {rainList.map((drop) => (
            <motion.div
              key={drop.id}
              style={{ left: drop.left, height: `${drop.height}px` }}
              animate={{ y: [-30, 190], opacity: [0, 0.85, 0] }}
              transition={{ repeat: Infinity, duration: drop.duration, delay: drop.delay, ease: 'linear' }}
              className="absolute top-0 w-[1.5px] bg-gradient-to-b from-transparent via-cyan-200/80 to-cyan-400/90 rounded-full -rotate-12 transform-gpu will-change-transform"
            />
          ))}

          {/* Gentle Ripple Effects at Bottom */}
          <motion.div
            animate={{ scale: [0.2, 1.9], opacity: [0.6, 0] }}
            transition={{ repeat: Infinity, duration: 2.2, ease: 'easeOut' }}
            className="absolute -bottom-4 left-1/3 w-16 h-4 border border-cyan-300/40 rounded-full transform-gpu will-change-transform"
          />
        </div>
      )}

      {/* --- Thunderstorm --- */}
      {category === 'thunderstorm' && (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-gray-900 to-indigo-950 transition-colors duration-700">
          {/* Lightning Flash Layer */}
          <motion.div
            animate={{ opacity: [0, 0, 0, 0.85, 0, 0.45, 0, 0] }}
            transition={{ repeat: Infinity, duration: 5.5, times: [0, 0.4, 0.42, 0.44, 0.46, 0.48, 0.5, 1] }}
            className="absolute inset-0 bg-cyan-100/35 mix-blend-overlay pointer-events-none transform-gpu will-change-transform"
          />

          {/* Storm Cloud Layers */}
          <div className="absolute -top-12 inset-x-0 h-32 bg-zinc-900/90 blur-xl transform-gpu" />

          {/* Heavy Rain Streaks */}
          {rainList.map((drop) => (
            <motion.div
              key={drop.id}
              style={{ left: drop.left, height: `${drop.height + 6}px` }}
              animate={{ y: [-30, 200], opacity: [0, 0.95, 0] }}
              transition={{ repeat: Infinity, duration: drop.duration * 0.75, delay: drop.delay, ease: 'linear' }}
              className="absolute top-0 w-[1.75px] bg-gradient-to-b from-transparent via-cyan-100 to-blue-400 rounded-full -rotate-12 transform-gpu will-change-transform"
            />
          ))}
        </div>
      )}

      {/* --- Cloudy / Overcast / Fog --- */}
      {(category === 'cloudy' || category === 'fog') && (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-300/40 via-zinc-400/30 to-slate-500/20 dark:from-zinc-900 dark:via-slate-900 dark:to-zinc-800 transition-colors duration-700">
          {/* Overcast Cloud Layers */}
          <motion.div
            animate={{ x: ['-10%', '10%', '-10%'] }}
            transition={{ repeat: Infinity, duration: 18, ease: 'easeInOut' }}
            className="absolute -top-6 -left-10 w-80 h-32 bg-white/40 dark:bg-zinc-700/40 rounded-full blur-xl transform-gpu will-change-transform"
          />
          <motion.div
            animate={{ x: ['10%', '-10%', '10%'] }}
            transition={{ repeat: Infinity, duration: 22, ease: 'easeInOut' }}
            className="absolute top-2 -right-10 w-96 h-36 bg-slate-200/30 dark:bg-zinc-800/50 rounded-full blur-2xl transform-gpu will-change-transform"
          />
        </div>
      )}

      {/* --- Snow --- */}
      {category === 'snow' && (
        <div className="absolute inset-0 bg-gradient-to-br from-sky-900/60 via-slate-800/80 to-indigo-950 transition-colors duration-700">
          {snowList.map((flake) => (
            <motion.div
              key={flake.id}
              style={{ left: flake.left }}
              animate={{ y: [-20, 180], x: [-10, 10, -10], opacity: [0, 0.9, 0] }}
              transition={{ repeat: Infinity, duration: flake.duration, delay: flake.delay, ease: 'easeInOut' }}
              className="absolute top-0 w-2 h-2 bg-white/90 rounded-full blur-[0.5px] transform-gpu will-change-transform shadow-[0_0_6px_rgba(255,255,255,0.9)]"
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function WeatherHeaderBanner({ user, onOpenSettings }: WeatherHeaderBannerProps) {
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [imgError, setImgError] = useState<boolean>(false);

  const fetchWeather = useCallback(async () => {
    setLoading(true);
    try {
      let lat = 14.5995; // Default Manila / tropical default
      let lon = 120.9842;
      let city = '';

      // Try HTML5 Geolocation API first
      if ('geolocation' in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 6000,
              maximumAge: 300000,
            });
          });
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
        } catch {
          // Fallback to IP geolocation if browser permissions denied/timed out
          try {
            const ipRes = await fetch('https://ipapi.co/json/').then((r) => r.json());
            if (ipRes && ipRes.latitude && ipRes.longitude) {
              lat = ipRes.latitude;
              lon = ipRes.longitude;
              city = ipRes.city || ipRes.region || '';
            }
          } catch {
            // Keep default
          }
        }
      }

      // Fetch real-time weather from Open-Meteo
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,is_day,weather_code&timezone=auto`;
      const res = await fetch(weatherUrl);
      if (!res.ok) throw new Error('Open-Meteo error');
      const data = await res.json();
      const current = data.current;
      const temp = Math.round(current?.temperature_2m ?? 26);
      const code = current?.weather_code ?? 0;
      const isDay = current?.is_day === 1;

      const parsed = parseWMO(code, isDay);

      setWeather({
        temp,
        weatherCode: code,
        condition: parsed.condition,
        icon: parsed.icon,
        category: parsed.category,
        isDay,
        locationName: city,
      });
    } catch {
      // Graceful fallback
      const hours = new Date().getHours();
      const isDay = hours >= 6 && hours < 18;
      const parsed = parseWMO(0, isDay);
      setWeather({
        temp: 27,
        weatherCode: 0,
        condition: parsed.condition,
        icon: parsed.icon,
        category: parsed.category,
        isDay,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWeather();
  }, [fetchWeather]);

  const greeting = getGreeting(user?.name);
  const avatarUrl = user?.avatar || (user as any)?.avatarUrl || (user as any)?.photoURL;

  const defaultCategory = weather?.category || (new Date().getHours() >= 6 && new Date().getHours() < 18 ? 'clear-day' : 'clear-night');
  const defaultIsDay = weather ? weather.isDay : new Date().getHours() >= 6 && new Date().getHours() < 18;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/30 dark:border-white/10 shadow-xl transition-all duration-300">
      {/* ── Dynamic Atmospheric Background Layer ── */}
      <AtmosphericWeatherOverlay category={defaultCategory} isDay={defaultIsDay} />

      {/* ── High-Contrast Glassmorphic Layout Guard Container ── */}
      <div className="relative z-10 p-5 sm:p-6 backdrop-blur-xl bg-white/15 dark:bg-zinc-900/50 border border-white/20 dark:border-white/10 transition-colors duration-300">
        <div className="flex items-center justify-between gap-4">
          
          {/* Greeting & Weather Status Badge */}
          <div className="min-w-0 flex-1">
            {/* Live Weather Pill Badge */}
            <div className="mb-2 inline-flex items-center gap-2">
              <button
                type="button"
                onClick={fetchWeather}
                disabled={loading}
                title="Refresh Weather"
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/60 dark:bg-zinc-800/80 backdrop-blur-md border border-white/60 dark:border-white/20 shadow-xs text-xs font-bold text-zinc-900 dark:text-zinc-100 hover:bg-white/80 dark:hover:bg-zinc-800 transition-all cursor-pointer active:scale-95 group"
              >
                <span className="text-sm leading-none">{weather ? weather.icon : '☀️'}</span>
                <span className="tabular-nums font-black">{weather ? `${weather.temp}°C` : '--°C'}</span>
                <span className="opacity-40">•</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{weather ? weather.condition : 'Checking weather...'}</span>
                {weather?.locationName && (
                  <>
                    <span className="opacity-40">•</span>
                    <span className="flex items-center gap-0.5 text-[11px] text-zinc-600 dark:text-zinc-300">
                      <MapPin className="w-3 h-3" />
                      {weather.locationName}
                    </span>
                  </>
                )}
                <RefreshCw className={`w-3 h-3 ml-0.5 text-zinc-500 dark:text-zinc-400 group-hover:rotate-180 transition-transform duration-500 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Dynamic Time-of-Day Greeting */}
            <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-zinc-50 tracking-tight truncate drop-shadow-[0_1px_2px_rgba(255,255,255,0.7)] dark:drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
              {greeting}
            </h1>
            <p className="text-xs sm:text-sm font-semibold text-zinc-700 dark:text-zinc-300 mt-0.5 flex items-center gap-1.5 drop-shadow-[0_1px_1px_rgba(255,255,255,0.5)] dark:drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">
              <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
              <span className="inline-block w-1 h-1 rounded-full bg-zinc-400 dark:bg-zinc-500" />
              <span className="flex items-center gap-1 text-purple-700 dark:text-purple-300 font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                GoraGo Financial Dashboard
              </span>
            </p>
          </div>

          {/* User Profile Avatar Silhouette Integration */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="relative shrink-0 group focus:outline-hidden cursor-pointer"
            aria-label="User Settings & Profile"
          >
            {avatarUrl && !imgError ? (
              <div className="relative">
                <img
                  src={avatarUrl}
                  alt={user?.name || 'Profile'}
                  onError={() => setImgError(true)}
                  className="w-12 h-12 rounded-2xl object-cover ring-2 ring-white/80 dark:ring-white/30 shadow-md group-hover:scale-105 active:scale-95 transition-all"
                />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-900 shadow-xs" />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-white/30 dark:bg-zinc-800/50 backdrop-blur-xl border border-white/40 dark:border-white/20 shadow-md flex items-center justify-center text-zinc-800 dark:text-zinc-100 group-hover:bg-white/50 dark:group-hover:bg-zinc-700/60 group-hover:scale-105 active:scale-95 transition-all ring-2 ring-white/40 dark:ring-white/10 shadow-[inset_0_1px_2px_rgba(255,255,255,0.4)]">
                <UserCircle className="w-7 h-7 text-zinc-800 dark:text-zinc-100 stroke-[1.75]" />
              </div>
            )}
          </button>

        </div>
      </div>
    </div>
  );
}

