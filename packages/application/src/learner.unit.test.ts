import{describe,expect,it,vi}from'vitest';import{LearnerService,type LearnerRepository}from'./index.js';
const saveProfile=vi.fn();const repository={saveProfile} as unknown as LearnerRepository;
describe('learner application validation',()=>{it('rejects invalid IANA timezone before persistence',()=>{const service=new LearnerService(repository);expect(()=>service.saveProfile('account',{interfaceLanguage:'es',nativeLanguage:'es',timezone:'Nope/Nope',cefrLevel:'A1',interests:[]})).toThrow('INVALID_TIMEZONE');expect(saveProfile).not.toHaveBeenCalled();});});
