import { Alert, AlertIcon, Text } from '@chakra-ui/react';
import { useApplicationApiClients } from './useApplicationApiClients';

// The standing explanation shown when an Application is down to its last
// credential (mandated verbatim copy — see
// docs/design/ac-616-application-disappears.md), rendered on both the
// credentials list page (ApiClientsPage.tsx) and the credential detail page
// (ApiClientPage.tsx). It complements, rather than replaces, the `title`
// tooltip on the disabled Delete action in useApiClientActions.tsx: that
// tooltip is the point-of-action explanation (visible on hover/focus of the
// disabled button), while this legend is visible whenever the restriction
// applies, whether or not the user has reached for Delete yet.
export const CredentialsRequiredLegend = ({ applicationId }: { applicationId: number }) => {
  const { count, isCountKnown } = useApplicationApiClients(applicationId);

  // Display threshold: exactly one. The copy below asserts "the only
  // credential", which would be false at zero, so this must not be widened to
  // the enforcement threshold (<= 1). Rendering nothing while the count is
  // unknown is the safe failure mode for a hint — enforcement lives in the
  // BFF's 409.
  if (!isCountKnown || count !== 1) return null;

  return (
    <Alert status="warning" mt={4}>
      <AlertIcon />
      <Text fontSize="sm">
        An Application needs at least one credential to work. To replace a credential, create the
        new one first, then delete the old one.
      </Text>
    </Alert>
  );
};
