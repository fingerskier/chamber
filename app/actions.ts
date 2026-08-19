'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { auth, signIn, signOut } from '@/lib/auth'
import {
  approveAccessRequest,
  assertMember,
  createChannel,
  createWorkspace,
  denyAccessRequest,
  getChannel,
} from '@/lib/services/workspaces'
import { postMessage } from '@/lib/services/messages'
import { slugify } from '@/lib/slug'

async function requireUserId(): Promise<string> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  return session.user.id
}

export async function signInAction() {
  await signIn('google')
}

export async function signOutAction() {
  await signOut({ redirectTo: '/login' })
}

export async function createWorkspaceAction(formData: FormData) {
  const userId = await requireUserId()
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return
  const ws = await createWorkspace({ name, slug: slugify(name), ownerId: userId })
  redirect(`/w/${ws.slug}`)
}

export async function createChannelAction(workspaceId: string, wsSlug: string, formData: FormData) {
  const userId = await requireUserId()
  await assertMember(workspaceId, 'user', userId)
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return
  await createChannel({ workspaceId, name, slug: slugify(name) })
  revalidatePath(`/w/${wsSlug}`)
}

export async function postMessageAction(
  channelId: string,
  path: string,
  parentId: string | null,
  formData: FormData,
) {
  const userId = await requireUserId()
  const channel = await getChannel(channelId)
  await assertMember(channel.workspaceId, 'user', userId)
  const content = String(formData.get('content') ?? '').trim()
  if (!content) return
  await postMessage({
    channelId,
    senderType: 'user',
    senderId: userId,
    content,
    parentId: parentId ?? undefined,
  })
  revalidatePath(path)
}

export async function approveRequestAction(requestId: string, path: string) {
  const userId = await requireUserId()
  await approveAccessRequest(requestId, userId)
  revalidatePath(path)
}

export async function denyRequestAction(requestId: string, path: string) {
  const userId = await requireUserId()
  await denyAccessRequest(requestId, userId)
  revalidatePath(path)
}
