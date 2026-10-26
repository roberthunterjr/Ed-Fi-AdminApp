import {
  Alert,
  AlertIcon,
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Text,
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import {
  certificationTokenErrorMessage,
  useRequestCertificationToken,
} from '../../api-v2/useRequestCertificationToken';
import { isAuthValidFor, useCertificationAuth } from './CertificationAuthContext';
import { useRecentActivity } from './useRecentActivity';

// Calm, passive wording: the refresh time is not a deadline, and nothing is lost when it comes.
const HINT =
  'Credentials are checked with the Ed-Fi API and are never saved. For security, the connection is refreshed from time to time or when the page reloads; nothing is lost, the credentials are simply validated again.';

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const CertificationAuthenticateForm = ({
  sbEnvironmentId,
  edfiTenantId,
  odsId,
  isDisabled = false,
}: {
  sbEnvironmentId: number;
  edfiTenantId: number | undefined;
  odsId: number | undefined;
  isDisabled?: boolean;
}) => {
  const { auth, setAuth, expiringSoon } = useCertificationAuth();
  const requestToken = useRequestCertificationToken();
  const [key, setKey] = useState('');
  const [secret, setSecret] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const { reset } = requestToken;
  const recentlyActive = useRecentActivity();

  // A previous error or open refresh form must not carry over to a different tenant or ODS.
  useEffect(() => {
    reset();
    setRefreshing(false);
    setKey('');
    setSecret('');
  }, [edfiTenantId, odsId, reset]);

  const canAuthenticate = !isDisabled && edfiTenantId !== undefined && !!key.trim() && !!secret;

  const authenticate = async () => {
    if (edfiTenantId === undefined) return;
    try {
      const result = await requestToken.mutateAsync({
        sbEnvironmentId,
        edfiTenantId,
        body: { key: key.trim(), secret, odsId },
      });
      setAuth({ ...result, edfiTenantId, odsId });
      requestToken.reset();
      setKey('');
      setSecret('');
      setRefreshing(false);
    } catch {
      // The error is shown from requestToken.error below; never log it (it may echo input).
    }
  };

  const credentialInputs = (
    <>
      <FormControl>
        <FormLabel htmlFor="certification-key">Key</FormLabel>
        <Input
          id="certification-key"
          placeholder="Enter key"
          autoComplete="off"
          value={key}
          onChange={(event) => setKey(event.target.value)}
        />
      </FormControl>
      <FormControl>
        <FormLabel htmlFor="certification-secret">Secret</FormLabel>
        <Input
          id="certification-secret"
          placeholder="Enter secret"
          type="password"
          autoComplete="new-password"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
        />
      </FormControl>
      <Button
        mt={3}
        colorScheme="primary"
        type="button"
        isDisabled={!canAuthenticate}
        isLoading={requestToken.isPending}
        onClick={authenticate}
      >
        Validate credentials
      </Button>
    </>
  );

  const errorAlert = requestToken.error ? (
    <Alert status="error" mt={3}>
      <AlertIcon />
      {certificationTokenErrorMessage(requestToken.error)}
    </Alert>
  ) : null;

  if (isAuthValidFor(auth, edfiTenantId, odsId)) {
    return (
      <Box mt={2}>
        {expiringSoon && recentlyActive && (
          <Alert status="info" mb={3}>
            <AlertIcon />A quick refresh will be needed soon. Nothing is lost; select Refresh
            validity to continue without interruption.
          </Alert>
        )}
        <Text>Credentials validated · next refresh around {formatTime(auth.expiresAt)}</Text>
        {refreshing ? (
          <Box mt={3}>
            {credentialInputs}
            <Button
              mt={3}
              ml={2}
              variant="link"
              type="button"
              onClick={() => {
                requestToken.reset();
                setKey('');
                setSecret('');
                setRefreshing(false);
              }}
            >
              Cancel
            </Button>
          </Box>
        ) : (
          <Button
            mt={3}
            colorScheme="primary"
            type="button"
            onClick={() => {
              requestToken.reset();
              setRefreshing(true);
            }}
          >
            Refresh validity
          </Button>
        )}
        <Text mt={3} fontSize="sm" color="gray.600">
          {HINT}
        </Text>
        {errorAlert}
      </Box>
    );
  }

  return (
    <Box>
      {credentialInputs}
      <Text mt={3} fontSize="sm" color="gray.600">
        {HINT}
      </Text>
      {errorAlert}
    </Box>
  );
};
