import { Injectable } from '@nestjs/common';

import { In, Not } from 'typeorm';

import { TimelineThread } from 'src/engine/core-modules/messaging/dtos/timeline-thread.dto';
import { TwentyORMManager } from 'src/engine/twenty-orm/twenty-orm.manager';
import { MessageChannelVisibility } from 'src/modules/messaging/common/standard-objects/message-channel.workspace-entity';
import { MessageParticipantWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-participant.workspace-entity';
import { MessageThreadWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-thread.workspace-entity';
import type { PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';
import type { WorkspaceMemberWorkspaceEntity } from 'src/modules/workspace-member/standard-objects/workspace-member.workspace-entity';

interface PersonWithCompositeFields extends PersonWorkspaceEntity {
  nameFirstName?: string | null;
  nameLastName?: string | null;
}

interface WorkspaceMemberWithCompositeFields
  extends WorkspaceMemberWorkspaceEntity {
  nameFirstName?: string | null;
  nameLastName?: string | null;
}

interface MessageParticipantWithRelations
  extends MessageParticipantWorkspaceEntity {
  person: PersonWithCompositeFields | null;
  workspaceMember: WorkspaceMemberWithCompositeFields | null;
}

@Injectable()
export class TimelineMessagingService {
  constructor(private readonly twentyORMManager: TwentyORMManager) {}

  public async getAndCountMessageThreads(
    personIds: string[],
    offset: number,
    pageSize: number,
  ): Promise<{
    messageThreads: Omit<
      TimelineThread,
      | 'firstParticipant'
      | 'lastTwoParticipants'
      | 'participantCount'
      | 'read'
      | 'visibility'
    >[];
    totalNumberOfThreads: number;
  }> {
    const messageThreadRepository =
      await this.twentyORMManager.getRepository<MessageThreadWorkspaceEntity>(
        'messageThread',
      );

    const totalNumberOfThreads = await messageThreadRepository
      .createQueryBuilder('messageThread')
      .innerJoin('messageThread.messages', 'messages')
      .innerJoin('messages.messageParticipants', 'messageParticipants')
      .where('messageParticipants.personId IN(:...personIds)', { personIds })
      .groupBy('messageThread.id')
      .getCount();

    const threadIdsQuery = await messageThreadRepository
      .createQueryBuilder('messageThread')
      .select('messageThread.id', 'id')
      .addSelect('MAX(messages.receivedAt)', 'max_received_at')
      .innerJoin('messageThread.messages', 'messages')
      .innerJoin('messages.messageParticipants', 'messageParticipants')
      .where('messageParticipants.personId IN (:...personIds)', { personIds })
      .groupBy('messageThread.id')
      .orderBy('max_received_at', 'DESC')
      .offset(offset)
      .limit(pageSize)
      .getRawMany();

    const messageThreadIds = threadIdsQuery.map((thread) => thread.id);

    const messageThreads = await messageThreadRepository.find({
      where: {
        id: In(messageThreadIds),
      },
      order: {
        messages: {
          receivedAt: 'DESC',
        },
      },
      relations: ['messages'],
    });

    return {
      messageThreads: messageThreads.map((messageThread) => {
        const lastMessage = messageThread.messages[0];
        const firstMessage =
          messageThread.messages[messageThread.messages.length - 1];

        return {
          id: messageThread.id,
          subject: firstMessage.subject,
          lastMessageBody: lastMessage.text,
          lastMessageReceivedAt: lastMessage.receivedAt ?? new Date(),
          numberOfMessagesInThread: messageThread.messages.length,
        };
      }),
      totalNumberOfThreads,
    };
  }

  public async getThreadParticipantsByThreadId(
    messageThreadIds: string[],
  ): Promise<Record<string, MessageParticipantWithRelations[]>> {
    const messageParticipantRepository =
      await this.twentyORMManager.getRepository<MessageParticipantWorkspaceEntity>(
        'messageParticipant',
      );
    const threadParticipants = (await messageParticipantRepository
      .createQueryBuilder()
      .select('messageParticipant')
      .addSelect('message.messageThreadId')
      .addSelect('message.receivedAt')
      .leftJoinAndSelect('messageParticipant.person', 'person')
      .leftJoinAndSelect(
        'messageParticipant.workspaceMember',
        'workspaceMember',
      )
      .leftJoin('messageParticipant.message', 'message')
      .where('message.messageThreadId = ANY(:messageThreadIds)', {
        messageThreadIds,
      })
      .andWhere('messageParticipant.role = :role', { role: 'from' })
      .orderBy('message.messageThreadId')
      .distinctOn(['message.messageThreadId', 'messageParticipant.handle'])
      .getMany()) as MessageParticipantWithRelations[];

    // This is because subqueries are not handled by twentyORM
    const orderedThreadParticipants = threadParticipants.sort(
      (a, b) =>
        (a.message.receivedAt ?? new Date()).getTime() -
        (b.message.receivedAt ?? new Date()).getTime(),
    );

    // This is because composite fields are not handled correctly by the ORM
    const threadParticipantsWithCompositeFields = orderedThreadParticipants.map(
      (threadParticipant) => ({
        ...threadParticipant,
        person: threadParticipant.person
          ? {
              ...threadParticipant.person,
              name: {
                firstName: threadParticipant.person.nameFirstName ?? '',
                lastName: threadParticipant.person.nameLastName ?? '',
              },
            }
          : null,
        workspaceMember: threadParticipant.workspaceMember
          ? {
              ...threadParticipant.workspaceMember,
              name: {
                firstName:
                  threadParticipant.workspaceMember.nameFirstName ?? '',
                lastName:
                  threadParticipant.workspaceMember.nameLastName ?? '',
              },
            }
          : null,
      }),
    );

    return threadParticipantsWithCompositeFields.reduce<Record<string, MessageParticipantWithRelations[]>>(
      (threadParticipantsAcc, threadParticipant) => {
        if (!threadParticipant.message.messageThreadId) {
          return threadParticipantsAcc;
        }

        if (!threadParticipantsAcc[threadParticipant.message.messageThreadId]) {
          threadParticipantsAcc[threadParticipant.message.messageThreadId] = [];
        }

        threadParticipantsAcc[threadParticipant.message.messageThreadId].push(
          threadParticipant,
        );

        return threadParticipantsAcc;
      },
      {},
    );
  }

  public async getThreadVisibilityByThreadId(
    messageThreadIds: string[],
    workspaceMemberId: string,
  ): Promise<{
    [key: string]: MessageChannelVisibility;
  }> {
    const messageThreadRepository =
      await this.twentyORMManager.getRepository<MessageThreadWorkspaceEntity>(
        'messageThread',
      );

    const threadsWithoutWorkspaceMember = await messageThreadRepository.find({
      select: {
        id: true,
      },
      where: {
        id: In(messageThreadIds),
        messages: {
          messageChannelMessageAssociations: {
            messageChannel: {
              connectedAccount: {
                accountOwnerId: Not(workspaceMemberId),
              },
            },
          },
        },
      },
    });

    const threadIdsWithoutWorkspaceMember = threadsWithoutWorkspaceMember.map(
      (thread) => thread.id,
    );

    const threadVisibility = await messageThreadRepository
      .createQueryBuilder()
      .select('messageThread.id', 'id')
      .addSelect('messageChannel.visibility', 'visibility')
      .leftJoin('messageThread.messages', 'message')
      .leftJoin(
        'message.messageChannelMessageAssociations',
        'messageChannelMessageAssociation',
      )
      .leftJoin(
        'messageChannelMessageAssociation.messageChannel',
        'messageChannel',
      )
      .where('messageThread.id = ANY(:messageThreadIds)', {
        messageThreadIds: threadIdsWithoutWorkspaceMember,
      })
      .getRawMany();

    const visibilityValues = Object.values(MessageChannelVisibility);

    const threadVisibilityByThreadIdForWhichWorkspaceMemberIsNotOwner:
      | {
          [key: string]: MessageChannelVisibility;
        }
      | undefined = threadVisibility?.reduce(
      (threadVisibilityAcc, threadVisibility) => {
        threadVisibilityAcc[threadVisibility.id] =
          visibilityValues[
            Math.max(
              visibilityValues.indexOf(threadVisibility.visibility),
              visibilityValues.indexOf(
                threadVisibilityAcc[threadVisibility.id] ??
                  MessageChannelVisibility.METADATA,
              ),
            )
          ];

        return threadVisibilityAcc;
      },
      {},
    );

    const threadVisibilityByThreadId: Record<string, MessageChannelVisibility> =
      messageThreadIds.reduce<Record<string, MessageChannelVisibility>>(
        (threadVisibilityAcc, messageThreadId) => {
          // If the workspace member is not the owner of the thread, use the visibility value from the query
          threadVisibilityAcc[messageThreadId] =
            threadIdsWithoutWorkspaceMember.includes(messageThreadId)
              ?
                  threadVisibilityByThreadIdForWhichWorkspaceMemberIsNotOwner?.[
                    messageThreadId
                  ] ?? MessageChannelVisibility.METADATA
              : MessageChannelVisibility.SHARE_EVERYTHING;

          return threadVisibilityAcc;
        },
        {},
      );

    return threadVisibilityByThreadId;
  }
}
