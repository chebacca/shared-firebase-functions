/**
 * Provider Registry
 * 
 * Central registry for all integration providers
 * To add a new provider, implement the OAuthProvider interface and register it here
 */

import { ProviderPlugin, OAuthProvider } from './types';
import { GoogleProvider } from './providers/GoogleProvider';
import { BoxProvider } from './providers/BoxProvider';
import { DropboxProvider } from './providers/DropboxProvider';
import { SlackProvider } from './providers/SlackProvider';

/**
 * Provider Registry - Central registry for all integration providers
 * 
 * To add a new provider:
 * 1. Create provider class implementing OAuthProvider or ApiKeyProvider
 * 2. Import the provider class
 * 3. Register it in the constructor
 * 4. That's it! The rest of the system will automatically support it
 */
export class ProviderRegistry {
  private providers: Map<string, ProviderPlugin> = new Map();
  
  constructor() {
    // Register current providers
    this.register(new GoogleProvider());
    this.register(new BoxProvider());
    this.register(new DropboxProvider());
    this.register(new SlackProvider());
    
    // Future providers - uncomment when ready
    // this.register(new AirtableProvider());
    // this.register(new NotionProvider());
    // this.register(new OneDriveProvider());
    // this.register(new AsanaProvider());
    // this.register(new MondayProvider());
    // this.register(new TrelloProvider());
    // this.register(new JiraProvider());
    // this.register(new GitHubProvider());
    // this.register(new LinearProvider());
  }
  
  /**
   * Register a new provider plugin
   */
  register(provider: ProviderPlugin): void {
    this.providers.set(provider.name, provider);
    console.log(`✅ Registered provider: ${provider.displayName} (${provider.name})`);
  }
  
  /**
   * Get a provider by name
   */
  getProvider(name: string): ProviderPlugin | undefined {
    return this.providers.get(name);
  }
  
  /**
   * Get all registered providers
   */
  getAllProviders(): ProviderPlugin[] {
    return Array.from(this.providers.values());
  }
  
  /**
   * Get providers by type
   */
  getProvidersByType(type: 'oauth2' | 'api_key' | 'webhook' | 'basic_auth'): ProviderPlugin[] {
    return Array.from(this.providers.values())
      .filter(p => p.type === type);
  }
  
  /**
   * Check if provider is registered
   */
  hasProvider(name: string): boolean {
    return this.providers.has(name);
  }
}

// Singleton instance
export const providerRegistry = new ProviderRegistry();

