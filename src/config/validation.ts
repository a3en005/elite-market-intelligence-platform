/**
 * Runtime configuration validation.
 * 
 * This module provides centralized, startup-time validation of all critical
 * environment variables. It catches configuration errors immediately rather
 * than allowing them to cause runtime failures in production.
 */

export interface ValidatedConfig {
  // OANDA Configuration (Forex/Metals/Indices/Commodities)
  oanda: {
    apiKey: string;
    accountId: string;
    environment: 'practice' | 'live';
    enabled: boolean;
  };

  // Binance Configuration (Cryptocurrency)
  binance: {
    apiKey: string | null;
    enabled: boolean;
  };

  // Gemini AI Configuration
  gemini: {
    apiKey: string;
    enabled: boolean;
  };

  // Supabase Configuration
  supabase: {
    url: string;
    anonKey: string;
    enabled: boolean;
  };

  // Server Configuration
  server: {
    port: number;
    nodeEnv: 'development' | 'production' | 'test';
    maxJsonSize: string;
  };

  // API Behavior Configuration
  api: {
    oandaTimeoutMs: number;
    binanceTimeoutMs: number;
    retryCount: number;
    retryDelayMs: number;
    cacheTimeMs: number;
  };
}

interface ValidationError {
  variable: string;
  message: string;
  severity: 'critical' | 'warning';
}

/**
 * Validates all required environment variables at server startup.
 * Throws an error with clear messaging if any critical variable is missing.
 */
export function validateConfig(): ValidatedConfig {
  const errors: ValidationError[] = [];

  // Validate OANDA (required)
  const oandaApiKey = process.env.OANDA_API_KEY?.trim();
  const oandaAccountId = process.env.OANDA_ACCOUNT_ID?.trim();

  if (!oandaApiKey) {
    errors.push({
      variable: 'OANDA_API_KEY',
      message: 'Missing OANDA API key. Forex data feeds will be unavailable.',
      severity: 'critical',
    });
  }

  if (!oandaAccountId) {
    errors.push({
      variable: 'OANDA_ACCOUNT_ID',
      message: 'Missing OANDA account ID. Forex data feeds will be unavailable.',
      severity: 'critical',
    });
  }

  // Validate Binance (optional)
  const binanceApiKey = process.env.BINANCE_API_KEY?.trim() || null;
  if (!binanceApiKey) {
    console.warn(
      '[CONFIG] BINANCE_API_KEY not set. Cryptocurrency feeds will use public API with rate-limit restrictions.',
    );
  }

  // Validate Gemini (required)
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiApiKey) {
    errors.push({
      variable: 'GEMINI_API_KEY',
      message: 'Missing Gemini API key. Chart analysis feature will be unavailable.',
      severity: 'critical',
    });
  }

  // Validate Supabase (required)
  const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl) {
    errors.push({
      variable: 'VITE_SUPABASE_URL',
      message: 'Missing Supabase URL. Database connectivity will be unavailable.',
      severity: 'critical',
    });
  }

  if (!supabaseAnonKey) {
    errors.push({
      variable: 'VITE_SUPABASE_ANON_KEY',
      message: 'Missing Supabase anonymous key. Database connectivity will be unavailable.',
      severity: 'critical',
    });
  }

  // Report all errors and stop if any are critical
  if (errors.length > 0) {
    const criticalErrors = errors.filter((e) => e.severity === 'critical');
    const warnings = errors.filter((e) => e.severity === 'warning');

    console.error('\n❌ CONFIGURATION VALIDATION FAILED\n');
    console.error('Critical Issues:');
    criticalErrors.forEach((error) => {
      console.error(`  - ${error.variable}: ${error.message}`);
    });

    if (warnings.length > 0) {
      console.warn('\n⚠️ Warnings:');
      warnings.forEach((warning) => {
        console.warn(`  - ${warning.variable}: ${warning.message}`);
      });
    }

    console.error('\nPlease set the missing environment variables and restart the server.');
    console.error('See env.example for the complete list of required variables.\n');

    process.exit(1);
  }

  // Parse optional configurations
  const oandaEnv = (process.env.OANDA_ENV?.toLowerCase() as 'practice' | 'live') || 'practice';
  const nodeEnv = (process.env.NODE_ENV?.toLowerCase() as 'development' | 'production' | 'test') || 'development';
  const port = parseInt(process.env.PORT || '3000', 10);
  const maxJsonSize = process.env.MAX_JSON_SIZE || '15mb';

  // API behavior configuration with sensible defaults
  const oandaTimeoutMs = parseInt(process.env.OANDA_TIMEOUT_MS || '5000', 10);
  const binanceTimeoutMs = parseInt(process.env.BINANCE_TIMEOUT_MS || '10000', 10);
  const retryCount = parseInt(process.env.API_RETRY_COUNT || '2', 10);
  const retryDelayMs = parseInt(process.env.API_RETRY_DELAY_MS || '1000', 10);
  const cacheTimeMs = parseInt(process.env.API_CACHE_TIME_MS || '10000', 10);

  // Validate numeric configurations
  if (isNaN(port) || port < 1 || port > 65535) {
    errors.push({
      variable: 'PORT',
      message: `Invalid port number: ${port}. Must be between 1 and 65535.`,
      severity: 'critical',
    });
  }

  if (isNaN(oandaTimeoutMs) || oandaTimeoutMs < 100) {
    errors.push({
      variable: 'OANDA_TIMEOUT_MS',
      message: `Invalid timeout: ${oandaTimeoutMs}. Must be at least 100ms.`,
      severity: 'critical',
    });
  }

  if (errors.length > 0) {
    console.error('\n❌ INVALID CONFIGURATION VALUES\n');
    errors.forEach((error) => {
      console.error(`  - ${error.variable}: ${error.message}`);
    });
    process.exit(1);
  }

  const config: ValidatedConfig = {
    oanda: {
      apiKey: oandaApiKey!,
      accountId: oandaAccountId!,
      environment: oandaEnv,
      enabled: !!(oandaApiKey && oandaAccountId),
    },
    binance: {
      apiKey: binanceApiKey,
      enabled: !!binanceApiKey,
    },
    gemini: {
      apiKey: geminiApiKey!,
      enabled: !!geminiApiKey,
    },
    supabase: {
      url: supabaseUrl!,
      anonKey: supabaseAnonKey!,
      enabled: !!(supabaseUrl && supabaseAnonKey),
    },
    server: {
      port,
      nodeEnv,
      maxJsonSize,
    },
    api: {
      oandaTimeoutMs,
      binanceTimeoutMs,
      retryCount,
      retryDelayMs,
      cacheTimeMs,
    },
  };

  console.log(
    `✓ Configuration validated successfully (${config.oanda.enabled ? 'OANDA enabled' : 'OANDA disabled'}, ${config.binance.enabled ? 'Binance enabled' : 'Binance disabled'})`,
  );

  return config;
}

// Lazy-loaded singleton instance
let configInstance: ValidatedConfig | null = null;

/**
 * Get the validated configuration singleton.
 * Validates on first access, then returns cached instance.
 */
export function getConfig(): ValidatedConfig {
  if (!configInstance) {
    configInstance = validateConfig();
  }
  return configInstance;
}
