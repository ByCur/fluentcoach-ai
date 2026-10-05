import type { OidcProvider } from '@fluentcoach/application';
export class FakeOidcProvider implements OidcProvider { begin(){return Promise.resolve({authorizationUrl:'https://synthetic.invalid/authorize',state:'synthetic-state'})} callback(){return Promise.resolve({issuer:'https://synthetic.invalid/',subject:'oidc-learner'})} }
export * from './conversation.js';
export * from './analysis.js';
export * from './plans.js';
