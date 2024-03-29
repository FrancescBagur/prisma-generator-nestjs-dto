import { isId, isUnique } from '../field-classifiers';
import {
  getImportsDeco,
  makeImportsFromPrismaClient,
  mapDMMFToParsedField,
  uniq,
} from '../helpers';

import type { DMMF } from '@prisma/generator-helper';
import { ImportStatementParams } from '../types';
import { TemplateHelpers } from '../template-helpers';

export const transformConnect = ({
  model,
  templateHelpers,
}: {
  model: DMMF.Model;
  templateHelpers: TemplateHelpers;
}) => {
  const idFields = model.fields.filter((field) =>
    isId(field, model.primaryKey),
  );
  const isUniqueFields = model.fields.filter((field) => isUnique(field));

  const imports: ImportStatementParams[] = [];
  const fields = uniq([...idFields, ...isUniqueFields]).map((x) =>
    mapDMMFToParsedField(x),
  );
  if (fields.find((x) => x.kind === 'enum')) {
    const destruct = [];
    destruct.push('ApiProperty');
    imports.unshift({ from: '@nestjs/swagger', destruct });
  }

  // TODO: duplicated
  const importDeco = getImportsDeco(fields);
  if (importDeco) imports.push(importDeco);

  const importPrismaClient = makeImportsFromPrismaClient(
    fields,
    templateHelpers,
  );
  if (importPrismaClient) imports.push(importPrismaClient);

  return { model, fields, imports };
};
