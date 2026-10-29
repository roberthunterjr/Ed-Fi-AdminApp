import { registerDecorator } from 'class-validator';
import { parse } from '@aws-sdk/util-arn-parser';

const errorMessage = 'Invalid Amazon Resource Name';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validate = (value: any) => {
  try {
    return parse(value);
  } catch {
    return errorMessage;
  }
};

export function IsArn(validationOptions?: { allowEmptyString?: boolean }) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isArn',
      target: object.constructor,
      propertyName: propertyName,
      options: {
        message: (args) =>
          validationOptions?.allowEmptyString && args.value === ''
            ? ''
            : (validate(args.value) as string),
      },
      validator: {
        validate: (value) =>
          (validationOptions?.allowEmptyString && value === '') || validate(value) !== errorMessage
            ? true
            : false,
      },
    });
  };
}
