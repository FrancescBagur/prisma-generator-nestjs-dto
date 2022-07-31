import path from 'node:path';
import slash from 'slash';
import {
  isAnnotatedWith,
  isId,
  isRelation,
  isUnique,
} from '../field-classifiers';
import { parseExpression } from '@babel/parser';
import generate from '@babel/generator';

import type { DMMF } from '@prisma/generator-helper';
import type { TemplateHelpers } from '../template-helpers';
import type {
  Decorator,
  ImportStatementParams,
  Model,
  ParsedField,
} from '../types';
import { IsDecoValidator } from '../annotations';

const validateNested = {
  code: '@ValidateNested()',
  import: 'ValidateNested',
} as const;
const decoRelated = [validateNested];

export const uniq = <T = unknown>(input: T[]): T[] =>
  Array.from(new Set(input));
export const concatIntoArray = <T = unknown>(source: T[], target: T[]) =>
  source.forEach((item) => target.push(item));

export const makeImportsFromPrismaClient = (
  fields: ParsedField[],
  { scalarToTS }: TemplateHelpers,
): ImportStatementParams | null => {
  const enumsToImport = uniq(
    fields.filter(({ kind }) => kind === 'enum').map(({ type }) => type),
  );
  const importPrisma = fields
    .filter(({ kind }) => kind === 'scalar')
    .some(({ type }) => scalarToTS(type).includes('Prisma'));

  if (!(enumsToImport.length || importPrisma)) {
    return null;
  }

  return {
    from: '@prisma/client',
    destruct: importPrisma ? ['Prisma', ...enumsToImport] : enumsToImport,
  };
};

function getDecorators(field: DMMF.Field): Decorator[] {
  const ret = [];
  if (field.documentation) {
    const parsed = parseExpression(`${field.documentation} class {}`, {
      plugins: ['decorators-legacy'],
    });
    if (parsed.type !== 'ClassExpression')
      throw new Error('error parsing decorators');

    // TODO: Annotations
    if (parsed.decorators)
      for (const x of parsed.decorators)
        if (
          x.type === 'Decorator' &&
          x.expression.type === 'CallExpression' &&
          x.expression.callee.type === 'Identifier' &&
          IsDecoValidator(x.expression.callee.name)
        )
          ret.push({
            // TODO: types of babel
            code: generate(x as never).code,
            import: x.expression.callee.name,
          });
  }
  if (field.kind === 'object') ret.push(validateNested);

  return ret;
}

export const getImportsDeco = (
  parsed: ParsedField[],
): ImportStatementParams | undefined => {
  const destruct = uniq(
    parsed.flatMap((x) => x.decorators).flatMap((x) => x.import),
  );

  if (destruct.length)
    return {
      from: 'class-validator',
      destruct,
    };
};

// TODO: call one time
export const mapDMMFToParsedField = (
  field: DMMF.Field,
  overrides: Partial<DMMF.Field> = {},
): ParsedField => ({
  decorators: getDecorators(field),
  ...field,
  ...overrides,
});

export const getRelationScalars = (
  fields: DMMF.Field[],
): Record<string, string[]> => {
  const scalars = fields.flatMap(
    ({ relationFromFields = [] }) => relationFromFields,
  );

  return scalars.reduce(
    (result, scalar) => ({
      ...result,
      [scalar]: fields
        .filter(({ relationFromFields = [] }) =>
          relationFromFields.includes(scalar),
        )
        .map(({ name }) => name),
    }),
    {} as Record<string, string[]>,
  );
};

interface GetRelationConnectInputFieldsParam {
  field: DMMF.Field;
  allModels: DMMF.Model[];
}
// TODO: unused
export const getRelationConnectInputFields = ({
  field,
  allModels,
}: GetRelationConnectInputFieldsParam): Set<DMMF.Field> => {
  const { name, type, relationToFields = [] } = field;

  if (!isRelation(field)) {
    throw new Error(
      `Can not resolve RelationConnectInputFields for field '${name}'. Not a relation field.`,
    );
  }

  const relatedModel = allModels.find(
    ({ name: modelName }) => modelName === type,
  );

  if (!relatedModel) {
    throw new Error(
      `Can not resolve RelationConnectInputFields for field '${name}'. Related model '${type}' unknown.`,
    );
  }

  if (!relationToFields.length) {
    throw new Error(
      `Can not resolve RelationConnectInputFields for field '${name}'. Foreign keys are unknown.`,
    );
  }

  const foreignKeyFields = relationToFields.map((relationToFieldName) => {
    const relatedField = relatedModel.fields.find(
      (relatedModelField) => relatedModelField.name === relationToFieldName,
    );

    if (!relatedField)
      throw new Error(
        `Can not find foreign key field '${relationToFieldName}' on model '${relatedModel.name}'`,
      );

    return relatedField;
  });

  const idFields = relatedModel.fields.filter((relatedModelField) =>
    isId(relatedModelField, relatedModel.primaryKey),
  );

  const uniqueFields = relatedModel.fields.filter((relatedModelField) =>
    isUnique(relatedModelField),
  );

  return new Set<DMMF.Field>([
    ...foreignKeyFields,
    ...idFields,
    ...uniqueFields,
  ]);
};

export const getRelativePath = (from: string, to: string) => {
  const result = slash(path.relative(from, to));
  return result || '.';
};

interface GenerateRelationInputParam {
  field: DMMF.Field;
  model: Model;
  allModels: Model[];
  templateHelpers: TemplateHelpers;
  preAndSuffixClassName:
    | TemplateHelpers['createDtoName']
    | TemplateHelpers['updateDtoName'];
  canCreateAnnotation: RegExp;
  canConnectAnnotation: RegExp;
}
export const generateRelationInput = ({
  field,
  model,
  allModels,
  templateHelpers: t,
  preAndSuffixClassName,
  canCreateAnnotation,
  canConnectAnnotation,
}: GenerateRelationInputParam) => {
  const relationInputClassProps: Array<Pick<ParsedField, 'name' | 'type'>> = [];

  const imports: ImportStatementParams[] = [];
  const apiExtraModels: string[] = [];
  const generatedClasses: string[] = [];

  if (isAnnotatedWith(field, canCreateAnnotation)) {
    const preAndPostfixedName = t.createDtoName(field.type);
    apiExtraModels.push(preAndPostfixedName);

    const modelToImportFrom = allModels.find(({ name }) => name === field.type);

    if (!modelToImportFrom)
      throw new Error(
        `related model '${field.type}' for '${model.name}.${field.name}' not found`,
      );

    imports.push({
      from: slash(
        `${getRelativePath(model.output.dto, modelToImportFrom.output.dto)}${
          path.sep
        }${t.createDtoFilename(field.type)}`,
      ),
      destruct: [preAndPostfixedName],
    });

    relationInputClassProps.push({
      name: 'create',
      type: preAndPostfixedName,
    });
  }

  if (isAnnotatedWith(field, canConnectAnnotation)) {
    const preAndPostfixedName = t.connectDtoName(field.type);
    apiExtraModels.push(preAndPostfixedName);
    const modelToImportFrom = allModels.find(({ name }) => name === field.type);

    if (!modelToImportFrom)
      throw new Error(
        `related model '${field.type}' for '${model.name}.${field.name}' not found`,
      );

    imports.push({
      from: slash(
        `${getRelativePath(model.output.dto, modelToImportFrom.output.dto)}${
          path.sep
        }${t.connectDtoFilename(field.type)}`,
      ),
      destruct: [preAndPostfixedName],
    });

    relationInputClassProps.push({
      name: 'connect',
      type: preAndPostfixedName,
    });
  }

  if (!relationInputClassProps.length) {
    throw new Error(
      `Can not find relation input props for '${model.name}.${field.name}'`,
    );
  }

  const originalInputClassName = `${t.transformClassNameCase(
    model.name,
  )}${t.transformClassNameCase(field.name)}RelationInput`;

  const preAndPostfixedInputClassName = preAndSuffixClassName(
    originalInputClassName,
  );
  generatedClasses.push(`class ${preAndPostfixedInputClassName} {
    ${t.fieldsToDtoProps(
      relationInputClassProps.map((inputField) => ({
        ...inputField,
        decorators: decoRelated,
        kind: 'relation-input',
        isRequired: relationInputClassProps.length === 1,
        isList: field.isList,
      })),
      true,
    )}
  }`);

  apiExtraModels.push(preAndPostfixedInputClassName);

  return {
    type: preAndPostfixedInputClassName,
    imports,
    generatedClasses,
    apiExtraModels,
  };
};

export const mergeImportStatements = (
  first: ImportStatementParams,
  second: ImportStatementParams,
): ImportStatementParams => {
  if (first.from !== second.from) {
    throw new Error(
      `Can not merge import statements; 'from' parameter is different`,
    );
  }

  if (first.default && second.default) {
    throw new Error(
      `Can not merge import statements; both statements have set the 'default' preoperty`,
    );
  }

  const firstDestruct = first.destruct || [];
  const secondDestruct = second.destruct || [];
  const destructStrings = uniq(
    [...firstDestruct, ...secondDestruct].filter(
      (destructItem) => typeof destructItem === 'string',
    ),
  );

  const destructObject = [...firstDestruct, ...secondDestruct].reduce(
    (result: Record<string, string>, destructItem) => {
      if (typeof destructItem === 'string') return result;

      return { ...result, ...destructItem };
    },
    {} as Record<string, string>,
  );

  return {
    ...first,
    ...second,
    destruct: [...destructStrings, destructObject],
  };
};

export const zipImportStatementParams = (
  items: ImportStatementParams[],
): ImportStatementParams[] => {
  const itemsByFrom = items.reduce((result, item) => {
    const { from } = item;
    const { [from]: existingItem } = result;
    if (!existingItem) {
      return { ...result, [from]: item };
    }
    return { ...result, [from]: mergeImportStatements(existingItem, item) };
  }, {} as Record<ImportStatementParams['from'], ImportStatementParams>);

  return Object.values(itemsByFrom);
};