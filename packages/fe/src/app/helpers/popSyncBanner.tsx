import { PgBossJobState, SbSyncQueueDto } from '@edanalytics/models';
import { usePopBanner } from '../Layout/FeedbackBanner';
import { Link as RouterLink } from 'react-router';
import { Link } from '@chakra-ui/react';

export const popSyncBanner = (args: {
  popBanner: ReturnType<typeof usePopBanner>;
  syncQueue: Pick<SbSyncQueueDto, 'id' | 'state'>;
  /** Defaults to the global sync queue item page. */
  linkTo?: string;
  /** Defaults to 'Sync'. Titles read `${subject} queued`, `${subject} completed`, etc. */
  subject?: string;
}) => {
  const linkTo = args.linkTo ?? `/sb-sync-queues/${args.syncQueue.id}`;
  const subject = args.subject ?? 'Sync';
  const failureStates: PgBossJobState[] = ['failed', 'cancelled', 'expired'];
  const pendingStates: PgBossJobState[] = ['created', 'retry', 'active'];
  args.popBanner({
    type:
      args.syncQueue.state === 'completed'
        ? 'Success'
        : failureStates.includes(args.syncQueue.state)
        ? 'Error'
        : 'Info',
    title: `${subject} ${
      args.syncQueue.state === 'completed'
        ? 'completed'
        : failureStates.includes(args.syncQueue.state)
        ? 'contained an error'
        : 'queued'
    }`,
    message: (
      <>
        See the queue item for more details
        {pendingStates.includes(args.syncQueue.state) ? ' and updated status' : ''}:{' '}
        <Link as={RouterLink} to={linkTo}>
          {linkTo}
        </Link>
        .
      </>
    ),
  });
};
