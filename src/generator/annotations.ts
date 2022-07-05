import * as deco from 'class-validator/cjs/decorator/decorators';

export const DTO_IGNORE_MODEL = /@DtoIgnoreModel/;
export const NO_SET = /@NoSet/;
export const NO_ADD = /@NoAdd/;
export const DTO_ENTITY_HIDDEN = /@DtoEntityHidden/;
export const DTO_CREATE_OPTIONAL = /@DtoCreateOptional/;
export const DTO_UPDATE_OPTIONAL = /@DtoUpdateOptional/;
export const DTO_RELATION_REQUIRED = /@DtoRelationRequired/;
export const DTO_RELATION_CAN_CRAEATE_ON_CREATE =
  /@DtoRelationCanCreateOnCreate/;
export const DTO_RELATION_CAN_CONNECT_ON_CREATE =
  /@DtoRelationCanConnectOnCreate/;
export const DTO_RELATION_CAN_CRAEATE_ON_UPDATE =
  /@DtoRelationCanCreateOnUpdate/;
export const DTO_RELATION_CAN_CONNECT_ON_UPDATE =
  /@DtoRelationCanConnectOnUpdate/;
export const DTO_RELATION_MODIFIERS = [
  DTO_RELATION_CAN_CRAEATE_ON_CREATE,
  DTO_RELATION_CAN_CONNECT_ON_CREATE,
  DTO_RELATION_CAN_CRAEATE_ON_UPDATE,
  DTO_RELATION_CAN_CONNECT_ON_UPDATE,
];
export const DTO_RELATION_MODIFIERS_ON_CREATE = [
  DTO_RELATION_CAN_CRAEATE_ON_CREATE,
  DTO_RELATION_CAN_CONNECT_ON_CREATE,
];
export const DTO_RELATION_MODIFIERS_ON_UPDATE = [
  DTO_RELATION_CAN_CRAEATE_ON_UPDATE,
  DTO_RELATION_CAN_CONNECT_ON_UPDATE,
];

const DECO: readonly string[] = Object.keys(deco).filter((x) =>
  /^[A-Z][a-z]/.test(x),
);
export const IsDecoValidator = (x: string) => DECO.includes(x);
