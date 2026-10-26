import { Badge, Box, Button, Code, HStack, Text } from '@chakra-ui/react';
import { CertificationSavedStepRunDto, CertificationStepSnapshotDto } from '@edanalytics/models';
import { useState } from 'react';
import { httpStatusColorScheme, httpStatusLabel } from './certificationStepResults';
import {
  useCertificationStepSnapshot,
  UseCertificationStepSnapshotArgs,
} from './useCertificationStepSnapshot';

export const SNAPSHOT_DISCLAIMER =
  'This snapshot is deleted when the certification request is approved or rejected.';

const SNAPSHOT_MESSAGES: Record<Exclude<CertificationStepSnapshotDto['state'], 'body'>, string> = {
  tooLarge:
    'The response is larger than the 64 KB snapshot limit. To review it, call the Ed-Fi API directly.',
  none: "No response: the request wasn't sent.",
  deleted: 'The snapshot was deleted when the certification request was decided.',
};

const SnapshotContent = ({
  snapshot,
  isPending,
  isError,
}: ReturnType<typeof useCertificationStepSnapshot>) => {
  if (isPending) return <Text color="gray.600">Loading the response…</Text>;
  if (isError || !snapshot) return <Text color="gray.600">The response couldn't be loaded.</Text>;
  if (snapshot.state === 'body') {
    return (
      <Code as="pre" display="block" whiteSpace="pre-wrap" p={3} maxH="24em" overflowY="auto">
        {snapshot.body}
      </Code>
    );
  }
  return <Text color="gray.600">{SNAPSHOT_MESSAGES[snapshot.state]}</Text>;
};

/**
 * The selected step's API response: its HTTP status and saved snapshot (AC-690). It sits below
 * the parameters and the result at full width, so long values such as descriptor URIs fit.
 * Nothing renders until the step has a result, and the snapshot loads only when opened.
 */
export const CertificationStepResponseDetails = ({
  run,
  isRunning,
  snapshotArgs,
}: {
  run: CertificationSavedStepRunDto | undefined;
  isRunning: boolean;
  snapshotArgs: Omit<UseCertificationStepSnapshotArgs, 'enabled' | 'stepId' | 'ranAt'>;
}) => {
  const [isOpen, setOpen] = useState(false);
  const shownRun = isRunning ? undefined : run;
  const snapshot = useCertificationStepSnapshot({
    ...snapshotArgs,
    stepId: shownRun?.stepId,
    ranAt: shownRun?.ranAt,
    enabled: isOpen && shownRun !== undefined,
  });

  if (!shownRun) return null;

  return (
    <Box p={5} border="1px solid" borderColor="gray.200" borderRadius="md">
      <Button
        size="sm"
        variant="link"
        aria-expanded={isOpen}
        onClick={() => setOpen((open) => !open)}
      >
        {isOpen ? '▾' : '▸'} View response details
      </Button>
      {isOpen && (
        <Box mt={2}>
          {/* The HTTP status lives here, not in the result: it describes the call, not the step. */}
          {shownRun.responseStatus != null && (
            <HStack mb={2} spacing={2}>
              <Text fontSize="sm">API response:</Text>
              <Badge colorScheme={httpStatusColorScheme(shownRun.responseStatus, shownRun.status)}>
                {httpStatusLabel(shownRun.responseStatus)}
              </Badge>
            </HStack>
          )}
          <Text mb={2} fontSize="sm" color="gray.600">
            {SNAPSHOT_DISCLAIMER}
          </Text>
          <SnapshotContent {...snapshot} />
        </Box>
      )}
    </Box>
  );
};
