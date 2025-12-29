declare module 'docusign-esign' {
  export class ApiClient {
    constructor(basePath?: string);
    setBasePath(basePath: string): void;
    addDefaultHeader(key: string, value: string): void;
    setOAuthBasePath(basePath: string): void;
    requestJWTUserToken(clientId: string, userId: string, scopes: string[], privateKey: Buffer | string, expiresIn: number): Promise<any>;
    getUserInfo(accessToken: string): Promise<any>;
  }
  
  export class EnvelopesApi {
    constructor(apiClient: ApiClient);
    createEnvelope(accountId: string, envelopeDefinition: any, options?: any): Promise<any>;
    getEnvelope(accountId: string, envelopeId: string, options?: any): Promise<any>;
    getDocument(accountId: string, envelopeId: string, documentId: string, options?: any): Promise<any>;
  }
  
  export class Document {
    documentBase64?: string;
    documentId?: string;
    fileExtension?: string;
    name?: string;
  }
  
  export class Signer {
    email?: string;
    name?: string;
    recipientId?: string;
    routingOrder?: string;
    tabs?: Tabs;
  }
  
  export class SignHere {
    anchorString?: string;
    anchorXOffset?: string;
    anchorYOffset?: string;
    anchorUnits?: string;
    documentId?: string;
    pageNumber?: string;
    recipientId?: string;
    tabId?: string;
    tabLabel?: string;
    xPosition?: string;
    yPosition?: string;
  }
  
  export class Tabs {
    signHereTabs?: SignHere[];
  }
  
  export class Recipients {
    signers?: Signer[];
  }
  
  export class EnvelopeDefinition {
    documents?: Document[];
    emailSubject?: string;
    emailBlurb?: string;
    recipients?: Recipients;
    status?: string;
  }
}

