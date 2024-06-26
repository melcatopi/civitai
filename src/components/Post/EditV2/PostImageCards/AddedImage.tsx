import {
  Accordion,
  ActionIcon,
  Alert,
  Badge,
  Button,
  Divider,
  Loader,
  LoadingOverlay,
  Menu,
  Text,
} from '@mantine/core';
import { ImageIngestionStatus } from '@prisma/client';
import {
  IconArrowBackUp,
  IconChevronDown,
  IconChevronUp,
  IconDotsVertical,
  IconEye,
  IconEyeOff,
  IconInfoCircle,
  IconPencil,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import React, { createContext, useContext, useState } from 'react';
import { ConfirmDialog } from '~/components/Dialog/Common/ConfirmDialog';
import { openSetBrowsingLevelModal } from '~/components/Dialog/dialog-registry';
import { dialogStore } from '~/components/Dialog/dialogStore';
import { EdgeMedia } from '~/components/EdgeMedia/EdgeMedia';
import { UnblockImage } from '~/components/Image/UnblockImage/UnblockImage';
import { BrowsingLevelBadge } from '~/components/ImageGuard/ImageGuard2';
import { InfoPopover } from '~/components/InfoPopover/InfoPopover';
import { ImageMetaModal } from '~/components/Post/EditV2/ImageMetaModal';
import {
  PostEditImageDetail,
  usePostEditStore,
  usePostPreviewContext,
} from '~/components/Post/EditV2/PostEditProvider';
import { PostImageTool } from '~/components/Post/EditV2/PostImageTool';
import { ImageToolsPopover } from '~/components/Post/EditV2/PostImageToolsPopover';
import { VotableTags } from '~/components/VotableTags/VotableTags';
import { useCurrentUserRequired } from '~/hooks/useCurrentUser';
import { useImageStore } from '~/store/image.store';
import { createSelectStore } from '~/store/select.store';
import { sortAlphabeticallyBy } from '~/utils/array-helpers';
import { showErrorNotification } from '~/utils/notifications';
import { trpc } from '~/utils/trpc';
import { CustomCard } from './CustomCard';

// #region [types]
type SimpleMetaPropsKey = keyof typeof simpleMetaProps;
const simpleMetaProps = {
  cfgScale: 'Guidance',
  steps: 'Steps',
  sampler: 'Sampler',
  seed: 'Seed',
} as const;
// #endregion

// #region [AddedImage context]
type State = {
  image: PostEditImageDetail;
  isBlocked: boolean;
  isScanned: boolean;
  isPending: boolean;
  onDelete: () => void;
  isDeleting: boolean;
  onEditMetaClick: () => void;
  isUpdating: boolean;
  toggleHidePrompt: () => void;
};
const AddedImageContext = createContext<State | null>(null);
const useAddedImageContext = () => {
  const context = useContext(AddedImageContext);
  if (!context) throw new Error('missing AddedImageContext ');
  return context;
};
// #endregion

// #region [AddedImage Provider]
export function AddedImage({ image }: { image: PostEditImageDetail }) {
  // #region [state]
  const { showPreview } = usePostPreviewContext();
  const storedImage = useImageStore(image);
  const [updateImage, setImages] = usePostEditStore((state) => [
    state.updateImage,
    state.setImages,
  ]);

  const { id, meta, blockedFor, ingestion, nsfwLevel, hideMeta } = storedImage;

  const isPending = ingestion === ImageIngestionStatus.Pending;
  // const isBlocked = ingestion === ImageIngestionStatus.Blocked;
  const isScanned = ingestion === ImageIngestionStatus.Scanned;
  const isBlocked = false;
  // #endregion

  // #region [delete image]
  const deleteImageMutation = trpc.image.delete.useMutation({
    onSuccess: (_, { id }) =>
      setImages((state) => state.filter((x) => x.type !== 'added' || x.data.id !== id)),
    onError: (error: any) => showErrorNotification({ error: new Error(error.message) }),
  });

  const handleDelete = () => {
    if (!isBlocked)
      dialogStore.trigger({
        component: ConfirmDialog,
        props: {
          title: 'Delete image',
          message: 'Are you sure you want to delete this image?',
          labels: { cancel: `Cancel`, confirm: `Yes, I am sure` },
          confirmProps: { color: 'red', loading: deleteImageMutation.isLoading },
          onConfirm: async () => await deleteImageMutation.mutateAsync({ id: image.id }),
        },
      });
    else deleteImageMutation.mutate({ id: image.id });
  };
  // #endregion

  // #region [image meta]
  const handleEditMetaClick = () => {
    dialogStore.trigger({
      component: ImageMetaModal,
      props: {
        id,
        meta: meta ?? undefined,
        nsfwLevel,
        blockedFor: blockedFor ?? undefined,
        updateImage,
      },
    });
  };

  const updateImageMutation = trpc.post.updateImage.useMutation({
    onSuccess: (_, { id, hideMeta }) => {
      updateImage(id, (image) => {
        image.hideMeta = hideMeta ?? false;
      });
    },
  });
  const toggleHidePrompt = () => {
    updateImageMutation.mutate({ id, hideMeta: !hideMeta });
  };
  // #endregion

  return (
    <AddedImageContext.Provider
      value={{
        image,
        isBlocked,
        isPending,
        isScanned,
        onDelete: handleDelete,
        isDeleting: deleteImageMutation.isLoading,
        onEditMetaClick: handleEditMetaClick,
        isUpdating: updateImageMutation.isLoading,
        toggleHidePrompt,
      }}
    >
      <div className="bg-gray-0 dark:bg-dark-8 border border-gray-1 dark:border-dark-6 rounded-lg overflow-hidden">
        {showPreview ? <Preview /> : <EditDetail />}
      </div>
    </AddedImageContext.Provider>
  );
}
// #endregion

const store = createSelectStore();
function Preview() {
  const { image } = useAddedImageContext();
  const { isBlocked } = useAddedImageContext();
  const opened = store.useIsSelected(image.id);
  const value = opened ? 'edit-detail' : null;

  return (
    <div className="flex flex-col">
      <PostImage />
      {isBlocked && <TosViolationBanner />}
      <Accordion
        value={value}
        onChange={(value) => store.toggle(image.id, !!value)}
        variant="separated"
        classNames={{ content: 'p-0' }}
      >
        <Accordion.Item value="edit-detail" className="border-none">
          <Accordion.Control>Edit details</Accordion.Control>
          <Accordion.Panel>
            <EditDetail />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </div>
  );
}

function EditDetail() {
  const [showMoreResources, setShowMoreResources] = useState(false);
  const { showPreview } = usePostPreviewContext();
  const {
    image,
    isBlocked,
    isPending,
    isScanned,
    isDeleting,
    onEditMetaClick,
    isUpdating,
    toggleHidePrompt,
  } = useAddedImageContext();

  const { meta, hideMeta, resourceHelper: resources } = image;
  const simpleMeta = Object.entries(simpleMetaProps).filter(([key]) => meta?.[key]);
  const hasSimpleMeta = !!simpleMeta.length;

  return (
    <div className="@container relative">
      <div className={`p-3 flex flex-col gap-3  ${!showPreview ? '@sm:p-6 @sm:gap-4' : ''}`}>
        <LoadingOverlay visible={isDeleting} />
        <div
          className={`flex flex-row-reverse flex-wrap gap-3 ${
            !showPreview ? '@sm:flex-nowrap @sm:gap-6' : ''
          }`}
        >
          {/*
      // #region [image]
      */}
          {(!showPreview || hasSimpleMeta) && (
            <div className={`flex flex-col gap-3 w-full ${!showPreview ? '@sm:w-4/12' : ''}`}>
              {!showPreview && <PostImage />}
              {hasSimpleMeta && (
                <>
                  <div className="flex flex-col not-last:*:border-b *:border-gray-4 dark:*:border-dark-4">
                    {simpleMeta.map(([key, label]) => (
                      <div key={key} className="flex justify-between py-0.5">
                        <Text>{label}</Text>
                        <Text>{meta?.[key as SimpleMetaPropsKey]}</Text>
                      </div>
                    ))}
                  </div>
                  {!isBlocked && (
                    <div>
                      <Button
                        variant="light"
                        color="blue"
                        compact
                        classNames={{ label: 'flex gap-1' }}
                        size="sm"
                        onClick={onEditMetaClick}
                        className="text-sm"
                      >
                        <IconPencil size={16} />
                        <span>EDIT</span>
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {/* #endregion */}

          <div className={`flex flex-col gap-3 w-full flex-1 ${!showPreview ? '@sm:gap-4' : ''}`}>
            {/*
          // #region [TOS Violation]
          */}
            {isBlocked && !showPreview && <TosViolationBanner />}
            {/* #endregion */}

            {/*
          // #region [prompt]
          */}

            <CustomCard className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <h3 className=" text-lg font-semibold leading-none text-dark-7 dark:text-gray-0">
                  Prompt
                </h3>
                {!isBlocked && (
                  <div className="flex gap-1">
                    <Button
                      variant="light"
                      color="blue"
                      compact
                      size="sm"
                      onClick={onEditMetaClick}
                      className="text-sm"
                    >
                      EDIT
                    </Button>
                    {meta?.prompt && (
                      <Button
                        variant={hideMeta ? 'filled' : 'light'}
                        color="blue"
                        compact
                        size="sm"
                        classNames={{ label: 'flex gap-1 text-sm' }}
                        onClick={toggleHidePrompt}
                        loading={isUpdating}
                      >
                        {hideMeta ? <IconEye size={16} /> : <IconEyeOff size={16} />}
                        <span>{hideMeta ? 'SHOW' : 'HIDE'} PROMPT</span>
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {meta?.prompt && (
                <Text className={`leading-5 line-clamp-3 ${hideMeta ? 'opacity-20' : ''}`}>
                  {meta.prompt}
                </Text>
              )}
              {meta?.negativePrompt && (
                <>
                  <Divider />
                  <h3
                    className={`text-md leading-none text-dark-7 dark:text-gray-0 ${
                      hideMeta ? 'opacity-20' : ''
                    }`}
                  >
                    Negative Prompt
                  </h3>
                  <Text className={`leading-5 line-clamp-3 ${hideMeta ? 'opacity-20' : ''}`}>
                    {meta.negativePrompt}
                  </Text>
                </>
              )}
            </CustomCard>

            {/* #endregion */}

            {/*
          // #region [resources]
          */}
            {!!resources?.length && (
              <CustomCard className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <h3 className=" text-lg font-semibold leading-none text-dark-7 dark:text-gray-0 ">
                    Resources
                  </h3>
                  <InfoPopover
                    type="hover"
                    variant="transparent"
                    size="sm"
                    position="right"
                    iconProps={{ size: 20 }}
                  >
                    Models, LoRAs, embeddings or other Stable Diffusion specific resources used to
                    create this image.
                  </InfoPopover>
                </div>
                {resources
                  .filter((x) => !!x.modelName)
                  .slice(0, !showMoreResources ? 3 : resources.length)
                  .map((resource, i) => (
                    <div key={i} className="flex justify-between items-center gap-3">
                      <Text>
                        {resource.modelName} - {resource.modelType}
                      </Text>
                      <Badge color="gray" size="md" variant="filled">
                        {resource.modelVersionName}
                      </Badge>
                    </div>
                  ))}
                {resources.length > 3 && (
                  <div>
                    <Button
                      variant="light"
                      color="blue"
                      compact
                      size="sm"
                      classNames={{ label: 'flex gap-1' }}
                      onClick={() => setShowMoreResources((o) => !o)}
                    >
                      {!showMoreResources ? (
                        <>
                          <IconChevronDown size={16} />
                          <span>Show All ({resources.length})</span>
                        </>
                      ) : (
                        <>
                          <IconChevronUp size={16} />
                          <span>Show Less</span>
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CustomCard>
            )}
            {/* #endregion */}

            {/*
          // #region [missing resources]
          */}
            {!resources?.length && (
              <Alert className="rounded-lg" color="yellow">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <h3 className=" text-lg font-semibold leading-none text-dark-7 dark:text-gray-0 ">
                      Resources
                    </h3>
                    <InfoPopover
                      type="hover"
                      variant="transparent"
                      size="sm"
                      position="right"
                      iconProps={{ size: 20 }}
                    >
                      Traditional or generative AI programs, platformms or websites used to create
                      this image.
                    </InfoPopover>
                  </div>
                  <Text>
                    Install the{' '}
                    <Text
                      component="a"
                      href="https://github.com/civitai/sd_civitai_extension"
                      target="_blank"
                      variant="link"
                      rel="nofollow"
                    >
                      Civitai Extension for Automatic 1111 Stable Diffusion Web UI
                    </Text>{' '}
                    to automatically detect all the resources used in your images.
                  </Text>
                </div>
              </Alert>
            )}
            {/* #endregion */}

            {/*
          // #region [tools]
          */}

            <CustomCard className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <h3 className=" text-lg font-semibold leading-none text-dark-7 dark:text-gray-0 ">
                    Tools
                  </h3>
                  <ActionIcon variant="transparent" size="sm">
                    <IconInfoCircle />
                  </ActionIcon>
                </div>
                <ImageToolsPopover image={image}>
                  <Button
                    variant="light"
                    color="blue"
                    compact
                    size="sm"
                    classNames={{ label: 'flex gap-1' }}
                    onClick={() => undefined}
                    className="text-sm"
                  >
                    <IconPlus size={16} />
                    <span>TOOL</span>
                  </Button>
                </ImageToolsPopover>
              </div>
              {!!image.tools?.length && (
                <ul className="flex flex-col">
                  {sortAlphabeticallyBy([...image.tools], (x) => x.name).map((tool, index) => (
                    <li key={tool.id} className="list-none">
                      {index !== 0 && <Divider />}
                      <PostImageTool image={image} tool={tool} />
                    </li>
                  ))}
                </ul>
              )}
            </CustomCard>
            {/* #endregion */}

            {meta?.external && Object.keys(meta?.external).length > 0 && (
              <CustomCard className="flex flex-col gap-2">
                <h3 className=" text-lg font-semibold leading-none text-dark-7 dark:text-gray-0 ">
                  External Data
                </h3>
                <Text>Found external data - will apply after post is published.</Text>
              </CustomCard>
            )}
          </div>
        </div>
        {/*
 // #region [tags]
 */}
        {(!!image.tags?.length || isScanned) && (
          <>
            <Divider />
            <VotableTags
              entityId={image.id}
              entityType="image"
              tags={!!image.tags.length ? image.tags : undefined}
              collapsible
              canAdd
            />
          </>
        )}
        {isPending && (
          <Alert
            color="yellow"
            w="100%"
            radius={0}
            className="p-2 rounded-lg"
            classNames={{ message: 'flex items-center justify-center gap-2' }}
          >
            <Loader size="xs" />
            <Text align="center">Analyzing image</Text>
          </Alert>
        )}
        {/* #endregion */}
      </div>
    </div>
  );
}

function PostImage() {
  const { showPreview } = usePostPreviewContext();
  const { image, isBlocked, onDelete, isDeleting, onEditMetaClick } = useAddedImageContext();
  const { metadata, url, type, id, nsfwLevel } = image;
  return (
    <div className={`relative`}>
      <div
        className="flex-1 flex mx-auto"
        style={{
          // TODO - db/code cleanup - ideally we only use metadata to get dimensions in future
          aspectRatio: `${metadata?.width ?? 1}/${metadata?.height ?? 1}`,
          maxWidth: metadata?.width,
        }}
      >
        <EdgeMedia
          src={url}
          width={metadata?.width ?? 450}
          type={type}
          className={showPreview ? 'rounded-none' : 'rounded-lg'}
        />
      </div>
      <div className="absolute top-0 left-0 right-0 h-12 z-10 bg-gradient-to-b from-black opacity-25" />
      {!!nsfwLevel && (
        <BrowsingLevelBadge
          browsingLevel={nsfwLevel}
          size="lg"
          onClick={
            !isBlocked ? () => openSetBrowsingLevelModal({ imageId: id, nsfwLevel }) : undefined
          }
          className={`absolute top-2 left-2 z-20 ${!isBlocked ? 'cursor-pointer' : ''}`}
        />
      )}
      <div className="absolute top-2 right-2 z-20 flex gap-1">
        <Menu withArrow position="bottom-end">
          <Menu.Target>
            <ActionIcon>
              <IconDotsVertical
                color="#fff"
                filter="drop-shadow(1px 1px 2px rgb(0 0 0 / 50%)) drop-shadow(0px 5px 15px rgb(0 0 0 / 60%))"
              />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {!isBlocked && (
              <Menu.Item icon={<IconPencil size={16} />} onClick={onEditMetaClick}>
                Edit image
              </Menu.Item>
            )}
            <Menu.Item
              color="red"
              icon={<IconTrash size={16} />}
              onClick={onDelete}
              disabled={isDeleting}
            >
              Delete image
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>
    </div>
  );
}

function TosViolationBanner() {
  const currentUser = useCurrentUserRequired();
  const { image, onDelete, isDeleting } = useAddedImageContext();
  const { blockedFor, id } = image;
  const { showPreview } = usePostPreviewContext();
  return (
    <Alert
      color="red"
      className={`p-3 @container ${showPreview ? 'rounded-none' : 'rounded-lg'}`}
      classNames={{ message: 'flex flex-col items-center justify-center' }}
    >
      <Text color="red" className="font-bold">
        TOS Violation
      </Text>
      <Text>This image has been flagged as a TOS violation.</Text>
      {blockedFor && (
        <Text className="flex flex-wrap items-center gap-1">
          <span>Blocked for:</span>
          <Text color="red" inline className="font-semibold">
            {blockedFor}
          </Text>
        </Text>
      )}
      <div className="flex justify-center gap-3">
        {currentUser.isModerator && (
          <UnblockImage imageId={id} skipConfirm>
            {({ onClick, isLoading }) => (
              <Button
                onClick={onClick}
                loading={isLoading}
                color="gray.6"
                mt="xs"
                leftIcon={<IconArrowBackUp size={20} />}
              >
                Unblock
              </Button>
            )}
          </UnblockImage>
        )}
        <Button
          onClick={onDelete}
          loading={isDeleting}
          color="red.7"
          mt="xs"
          leftIcon={<IconTrash size={20} />}
        >
          Delete
        </Button>
      </div>
    </Alert>
  );
}
