import { Box, HStack, Text, TextProps } from '@chakra-ui/react';
import { StatusDisplay } from './certificationStepResults';

/** The coloured dot and label every certification status uses. */
export const CertificationStatusIndicator = ({
  display,
  dotSize = '8px',
  ...textProps
}: { display: StatusDisplay; dotSize?: string } & TextProps) => (
  <HStack spacing={2}>
    <Box w={dotSize} h={dotSize} borderRadius="full" bg={display.dotColor} aria-hidden="true" />
    <Text color={display.textColor} {...textProps}>
      {display.label}
    </Text>
  </HStack>
);
