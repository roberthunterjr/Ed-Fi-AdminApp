import { Box, HStack, Table, Tbody, Td, Text, Th, Thead, Tr } from '@chakra-ui/react';
import { CERT_STEP_ERROR_KIND, CertificationSavedStepRunDto } from '@edanalytics/models';
import { STEP_STATUS_DISPLAY, toDisplayStatus } from './certificationStepResults';

const formatRanAt = (ranAt: string) => {
  const date = new Date(ranAt);
  if (Number.isNaN(date.getTime())) return ranAt;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    date,
  );
};

/** The selected step's latest result: its saved run, or Running while a new run is in flight. */
export const CertificationStepResult = ({
  run,
  isRunning,
}: {
  run: CertificationSavedStepRunDto | undefined;
  isRunning: boolean;
}) => {
  const display = STEP_STATUS_DISPLAY[toDisplayStatus(run?.status, isRunning)];
  const shownRun = isRunning ? undefined : run;

  const exceptions =
    shownRun?.errors.filter((e) => e.kind === CERT_STEP_ERROR_KIND.exception) ?? [];
  const fields = shownRun?.errors.filter((e) => e.kind !== CERT_STEP_ERROR_KIND.exception) ?? [];

  return (
    <>
      <HStack mb={3} justify="space-between" alignItems="center">
        <Text fontWeight="semibold">Execution result</Text>
        <HStack spacing={2}>
          <Box w="10px" h="10px" borderRadius="full" bg={display.dotColor} />
          <Text fontSize="sm" fontWeight="medium" color={display.textColor}>
            {display.label}
          </Text>
        </HStack>
      </HStack>

      {isRunning && <Text color="gray.600">Running this step. This can take up to a minute.</Text>}
      {!isRunning && !run && <Text color="gray.600">Execute this step to see its result.</Text>}

      {shownRun && (
        <>
          <Text mb={3}>Last execution: {formatRanAt(shownRun.ranAt)}</Text>

          {exceptions.map((item, index) => (
            <Box
              key={`exception-${index}`}
              mb={3}
              p={3}
              border="1px solid"
              borderColor="red.200"
              bg="red.50"
              borderLeftWidth="4px"
              borderLeftColor="red.500"
              borderRadius="md"
            >
              <Text color="red.700" overflowWrap="anywhere">
                {item.message}
              </Text>
              {item.observed && (
                <Text mt={1} fontSize="sm" color="red.700">
                  {item.observed}
                </Text>
              )}
            </Box>
          ))}

          {fields.length > 0 && (
            <Box mb={3}>
              <Text mb={2} fontWeight="medium">
                {fields.length === 1 ? '1 field' : `${fields.length} fields`} didn't match
              </Text>
              {/* Descriptor URIs, nested paths and compact JSON have no spaces to wrap at. */}
              <Box overflowX="auto">
                <Table size="sm" sx={{ td: { overflowWrap: 'anywhere' } }}>
                  <Thead>
                    <Tr>
                      <Th>Field</Th>
                      <Th>Expected</Th>
                      <Th>Observed</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {fields.map((item, index) => (
                      <Tr key={`${item.field}-${index}`}>
                        <Td fontFamily="mono">{item.field}</Td>
                        {item.expected === null && item.observed === null && item.message ? (
                          // A check Bruno can't split into expected/observed: its message is the explanation.
                          <Td colSpan={2} color="red.700">
                            {item.message}
                          </Td>
                        ) : (
                          <>
                            <Td>{item.expected ?? '—'}</Td>
                            <Td color="red.700">{item.observed ?? '—'}</Td>
                          </>
                        )}
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            </Box>
          )}
        </>
      )}
    </>
  );
};
