import {
  Box,
  Button,
  ButtonGroup,
  Divider,
  HStack,
  IconButton,
  Input,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverFooter,
  PopoverTrigger,
  Portal,
  Radio,
  RadioGroup,
  Stack,
  Text,
} from '@chakra-ui/react';
import { stdDuration, stdShort } from '@edanalytics/utils';
import React, { useState } from 'react';
import { VirtualizedSelect } from '../VirtualizedSelect';
import { Icons } from '../Icons';
import type { SbaaColumn } from './sbaaTableFeatures';

export type WithMetaType = {
  columnDef: { meta?: { type?: 'date' | 'duration' | 'number' | 'options' } };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FilterValueLabel = ({ column }: { column: SbaaColumn<any> & WithMetaType }) => {
  const value = column.getFilterValue();

  if (value === undefined) {
    return <Text as="i">No filter</Text>;
  } else {
    if (column.columnDef.meta?.type === 'date' && Array.isArray(value)) {
      if (value[0] && value[1]) {
        return (
          <>
            {stdShort(value[0])} to {stdShort(value[1])}
          </>
        );
      } else if (value[0]) {
        return <>After {stdShort(value[0])}</>;
      } else if (value[1]) {
        return <>Before {stdShort(value[1])}</>;
      }
    }
    if (column.columnDef.meta?.type === 'duration' && Array.isArray(value)) {
      if (value[0] && value[1]) {
        return (
          <>
            {stdDuration(value[0])} to {stdDuration(value[1])}
          </>
        );
      } else if (value[0]) {
        return <>≥ {stdDuration(value[0])}</>;
      } else if (value[1]) {
        return <>≤ {stdDuration(value[1])}</>;
      }
    }
    if (column.columnDef.meta?.type === 'number' && Array.isArray(value)) {
      if (value[0] && value[1]) {
        return (
          <>
            {value[0]?.toLocaleString()} to {value[1]?.toLocaleString()}
          </>
        );
      } else if (value[0]) {
        return <>≥ {value[0]?.toLocaleString()}</>;
      } else if (value[1]) {
        return <>≤ {value[1]?.toLocaleString()}</>;
      }
    }
  }
  return <>{String(value)}</>;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ColumnLabel = ({ column }: { column: SbaaColumn<any> }) => (
  <Text as="span" fontWeight="bold">
    {typeof column.columnDef.header === 'function'
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        column.columnDef.header({ table: null as any, column, header: null as any })
      : column.columnDef.header}
    :&nbsp;
  </Text>
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ColumnFilter = ({ column }: { column: SbaaColumn<any> }) => {
  return (
    <Popover>
      {({ isOpen, onClose }) => (
        <>
          <HStack
            gap={0}
            border="1px solid"
            borderColor={isOpen ? 'gray.100' : 'transparent'}
            borderRadius="md"
            bg={isOpen ? 'gray.100' : 'transparent'}
            h={6}
            px={2}
            pr={1}
          >
            <PopoverTrigger>
              <Box as="button">
                <ColumnLabel column={column} />
                <Text
                  visibility={column.getFilterValue() === undefined ? 'hidden' : 'visible'}
                  as="span"
                >
                  <FilterValueLabel column={column} />
                </Text>
              </Box>
            </PopoverTrigger>
            <IconButton
              minW="auto"
              variant="link"
              border="1px solid transparent"
              _hover={{
                borderColor: 'gray.400',
              }}
              aria-label="clear column filter"
              icon={<Icons.X fontSize="md" />}
              size="xs"
              onClick={() => column.setFilterValue(undefined)}
            />
          </HStack>
          <Portal>
            <PopoverContent w="auto">
              <PopoverArrow />
              <ColumnFilterContent
                apply={(filter) => {
                  column.setFilterValue(filter);
                  onClose();
                }}
                cancel={() => {
                  onClose();
                }}
                column={column}
              />
            </PopoverContent>
          </Portal>
        </>
      )}
    </Popover>
  );
};

export const ColumnFilterContent = ({
  column,
  apply,
  cancel,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  column: SbaaColumn<any> & WithMetaType;
  cancel: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apply: React.Dispatch<React.SetStateAction<any>>;
}) => {
  return column.columnDef.meta?.type === 'date' ? (
    <DateFilter column={column} apply={apply} cancel={cancel} />
  ) : column.columnDef.meta?.type === 'duration' ? (
    <DurationFilter column={column} apply={apply} cancel={cancel} />
  ) : column.columnDef.meta?.type === 'number' ? (
    <NumberFilter column={column} apply={apply} cancel={cancel} />
  ) : column.columnDef.meta?.type === 'options' ? (
    <OptionsFilter column={column} apply={apply} cancel={cancel} />
  ) : null;
};

const dateTransformer = (value: number | string | '') => {
  if (value === '') {
    return undefined;
  }
  const newDate = new Date(value);
  const newValue = Number(newDate) + newDate.getTimezoneOffset() * 60 * 1000;
  return newValue;
};

const dateTransformerInv = (value: number | undefined) => {
  return value === undefined ? undefined : new Date(value).toISOString().split('T')[0];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const useMathFilterConstraints = (column: SbaaColumn<any>) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initial: any = column.getFilterValue();
  const [filter, setFilter] = useState<[number | undefined, number | undefined] | undefined>(
    initial
  );

  const [type, setType] = useState<'between' | 'less' | 'more'>(
    filter?.[0] && filter?.[1] ? 'between' : filter?.[1] ? 'less' : 'more'
  );

  const radioOnChange = (e: 'between' | 'less' | 'more') => {
    if (type === 'between' && e === 'less') {
      setFilter((old) => [undefined, old?.[1]]);
    } else if (type === 'between' && e === 'more') {
      setFilter((old) => [old?.[0], undefined]);
    } else if ((type === 'less' && e === 'more') || (type === 'more' && e === 'less')) {
      setFilter([undefined, undefined]);
    }
    setType(e);
  };

  const facetedMinMax = column.getFacetedMinMaxValues() as
    | undefined
    | [number[] | number, number[] | number];

  const dataMin = facetedMinMax
    ? Array.isArray(facetedMinMax[0])
      ? facetedMinMax[0][0]
      : facetedMinMax[0]
    : undefined;

  const dataMax = facetedMinMax
    ? Array.isArray(facetedMinMax[1])
      ? facetedMinMax[1][0]
      : facetedMinMax[1]
    : undefined;

  const filterMin = filter?.[0];
  const filterMax = filter?.[1];

  const minMax = filterMax === undefined ? dataMax : filterMax;
  const maxMin = filterMin === undefined ? dataMin : filterMin;

  const isDisabled =
    (filterMin === undefined && type !== 'less') || (filterMax === undefined && type !== 'more');

  return {
    initial,
    filter,
    setFilter,
    type,
    setType,
    radioOnChange,
    dataMin,
    dataMax,
    filterMin,
    filterMax,
    minMax,
    maxMin,
    isDisabled,
  };
};

export const DateFilter = ({
  column,
  cancel,
  apply,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  column: SbaaColumn<any>;
  cancel: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apply: React.Dispatch<React.SetStateAction<any>>;
}) => {
  const {
    filter,
    setFilter,
    type,
    radioOnChange,
    dataMin,
    dataMax,
    filterMin,
    filterMax,
    minMax,
    maxMin,
    isDisabled,
  } = useMathFilterConstraints(column);

  return (
    <>
      <PopoverBody w="auto" minW="15em" display="block">
        <Stack fontSize="sm" minW="24em">
          <ColumnLabel column={column} />
          <RadioGroup value={type} onChange={radioOnChange}>
            <Box mb={4}>
              <Radio value="between">Between</Radio>
              {type === 'between' ? (
                <HStack ml="1.5rem">
                  <Input
                    flex="0 0 16ch"
                    display="inline-block"
                    size="sm"
                    min={dateTransformerInv(dataMin)}
                    max={dateTransformerInv(minMax)}
                    value={filterMin !== undefined ? dateTransformerInv(filterMin) : ''}
                    onChange={({ target: { value } }) => {
                      setFilter((old) => [dateTransformer(value), old?.[1]]);
                    }}
                    placeholder="Earliest date value"
                    type="date"
                  />
                  <Text display="inline-block">and</Text>
                  <Input
                    flex="0 0 16ch"
                    display="inline-block"
                    size="sm"
                    min={dateTransformerInv(maxMin)}
                    max={dateTransformerInv(dataMax)}
                    value={filterMax ? dateTransformerInv(filterMax) : ''}
                    onChange={({ target: { value } }) => {
                      setFilter((old) => [old?.[0], dateTransformer(value)]);
                    }}
                    placeholder="Latest date value"
                    type="date"
                  />
                </HStack>
              ) : null}
            </Box>
            <Box mb={4}>
              <Radio value="less">Before</Radio>
              {type === 'less' ? (
                <HStack ml="1.5rem">
                  <Input
                    flex="0 0 16ch"
                    display="inline-block"
                    size="sm"
                    min={dateTransformerInv(maxMin)}
                    max={dateTransformerInv(dataMax)}
                    value={filterMax ? dateTransformerInv(filterMax) : ''}
                    onChange={({ target: { value } }) => {
                      setFilter((old) => [old?.[0], dateTransformer(value)]);
                    }}
                    placeholder="Latest date value"
                    type="date"
                  />
                </HStack>
              ) : null}
            </Box>
            <Box mb={4}>
              <Radio value="more">After</Radio>
              {type === 'more' ? (
                <HStack ml="1.5rem">
                  <Input
                    flex="0 0 16ch"
                    display="inline-block"
                    size="sm"
                    min={dateTransformerInv(dataMin)}
                    max={dateTransformerInv(minMax)}
                    value={filterMin !== undefined ? dateTransformerInv(filterMin) : ''}
                    onChange={({ target: { value } }) => {
                      setFilter((old) => [dateTransformer(value), old?.[1]]);
                    }}
                    placeholder="Earliest date value"
                    type="date"
                  />
                </HStack>
              ) : null}
            </Box>
          </RadioGroup>
        </Stack>
      </PopoverBody>
      <FilterContentFooter
        apply={() => apply(filter)}
        clear={() => apply(undefined)}
        cancel={cancel}
        column={column}
        isDisabled={isDisabled}
      />
    </>
  );
};

export const NumberFilter = ({
  column,
  cancel,
  apply,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  column: SbaaColumn<any>;
  cancel: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apply: React.Dispatch<React.SetStateAction<any>>;
}) => {
  const {
    filter,
    setFilter,
    type,
    radioOnChange,
    dataMin,
    dataMax,
    filterMin,
    filterMax,
    minMax,
    maxMin,
    isDisabled,
  } = useMathFilterConstraints(column);

  return (
    <>
      <PopoverBody w="auto" minW="15em" display="block">
        <Stack fontSize="sm" minW="24em">
          <ColumnLabel column={column} />
          <RadioGroup value={type} onChange={radioOnChange}>
            <Box mb={4}>
              <Radio value="between">Between</Radio>
              {type === 'between' ? (
                <HStack ml="1.5rem">
                  <NumberInput
                    w="16ch"
                    display="inline-block"
                    size="sm"
                    min={dataMin}
                    max={minMax}
                    value={filterMin !== undefined ? filterMin : ''}
                    onChange={(str, value) => {
                      setFilter((old) => [value, old?.[1]]);
                    }}
                  >
                    <NumberInputField placeholder="Minimum value" />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                  <Text display="inline-block">and</Text>
                  <NumberInput
                    w="16ch"
                    display="inline-block"
                    size="sm"
                    min={maxMin}
                    max={dataMax}
                    value={filterMax ? filterMax : ''}
                    onChange={(str, value) => {
                      setFilter((old) => [old?.[0], value]);
                    }}
                  >
                    <NumberInputField placeholder="Maximum value" />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                </HStack>
              ) : null}
            </Box>
            <Box mb={4}>
              <Radio value="less">Less than or equal to</Radio>
              {type === 'less' ? (
                <HStack ml="1.5rem">
                  <NumberInput
                    w="16ch"
                    display="inline-block"
                    size="sm"
                    min={maxMin}
                    max={dataMax}
                    value={filterMax ? filterMax : ''}
                    onChange={(str, value) => {
                      setFilter((old) => [old?.[0], value]);
                    }}
                  >
                    <NumberInputField placeholder="Maximum value" />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                </HStack>
              ) : null}
            </Box>
            <Box mb={4}>
              <Radio value="more">Greater than or equal to</Radio>
              {type === 'more' ? (
                <HStack ml="1.5rem">
                  <NumberInput
                    w="16ch"
                    display="inline-block"
                    size="sm"
                    min={dataMin}
                    max={minMax}
                    value={filterMin !== undefined ? filterMin : ''}
                    onChange={(str, value) => {
                      setFilter((old) => [value, old?.[1]]);
                    }}
                  >
                    <NumberInputField placeholder="Minimum value" />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                </HStack>
              ) : null}
            </Box>
          </RadioGroup>
        </Stack>
      </PopoverBody>
      <FilterContentFooter
        apply={() => apply(filter)}
        clear={() => apply(undefined)}
        cancel={cancel}
        column={column}
        isDisabled={isDisabled}
      />
    </>
  );
};

type DurationUnit = 'second' | 'minute' | 'hour' | 'day';

const secondsToInput = (s: number | undefined | null, unit: DurationUnit) => {
  if (s === undefined || s === null) {
    return undefined;
  }
  switch (unit) {
    case 'second':
      return s;
    case 'minute':
      return s / 60;
    case 'hour':
      return s / 60 / 60;
    case 'day':
      return s / 60 / 60 / 24;
  }
};

const inputToSeconds = (s: number | undefined, unit: DurationUnit) => {
  if (s === undefined) {
    return undefined;
  }
  switch (unit) {
    case 'second':
      return s;
    case 'minute':
      return s * 60;
    case 'hour':
      return s * 60 * 60;
    case 'day':
      return s * 60 * 60 * 24;
  }
};

/** Uses seconds internally */
export const DurationFilter = ({
  column,
  cancel,
  apply,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  column: SbaaColumn<any>;
  cancel: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apply: React.Dispatch<React.SetStateAction<any>>;
}) => {
  const {
    filter,
    setFilter,
    type,
    radioOnChange,
    dataMin,
    dataMax,
    filterMin,
    filterMax,
    minMax,
    maxMin,
    isDisabled,
  } = useMathFilterConstraints(column);

  const [unit, setUnit] = useState<DurationUnit>('second');

  return (
    <>
      <PopoverBody w="auto" minW="15em" display="block">
        <ColumnLabel column={column} />
        <ButtonGroup display="flex" isAttached size="sm" mt={1} mb={3}>
          <Button
            flexGrow={1}
            px={2}
            onClick={() => setUnit('second')}
            colorScheme={unit === 'second' ? 'blue' : undefined}
          >
            Seconds
          </Button>
          <Button
            flexGrow={1}
            px={2}
            onClick={() => setUnit('minute')}
            colorScheme={unit === 'minute' ? 'blue' : undefined}
          >
            Minutes
          </Button>
          <Button
            flexGrow={1}
            px={2}
            onClick={() => setUnit('hour')}
            colorScheme={unit === 'hour' ? 'blue' : undefined}
          >
            Hours
          </Button>
          <Button
            flexGrow={1}
            px={2}
            onClick={() => setUnit('day')}
            colorScheme={unit === 'day' ? 'blue' : undefined}
          >
            Days
          </Button>
        </ButtonGroup>
        <Divider mb={3} />
        <Stack fontSize="sm" minW="24em">
          <RadioGroup value={type} onChange={radioOnChange}>
            <Box mb={4}>
              <Radio value="between">Between</Radio>
              {type === 'between' ? (
                <HStack ml="1.5rem">
                  <NumberInput
                    w="16ch"
                    display="inline-block"
                    size="sm"
                    min={secondsToInput(dataMin, unit)}
                    max={secondsToInput(minMax, unit)}
                    value={secondsToInput(filterMin, unit)}
                    onChange={(str, value) => {
                      setFilter((old) => [inputToSeconds(value, unit), old?.[1]]);
                    }}
                  >
                    <NumberInputField placeholder="Minimum value" />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                  <Text display="inline-block">and</Text>
                  <NumberInput
                    w="16ch"
                    display="inline-block"
                    size="sm"
                    min={secondsToInput(maxMin, unit)}
                    max={secondsToInput(dataMax, unit)}
                    value={secondsToInput(filterMax, unit)}
                    onChange={(str, value) => {
                      setFilter((old) => [old?.[0], inputToSeconds(value, unit)]);
                    }}
                  >
                    <NumberInputField placeholder="Maximum value" />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                </HStack>
              ) : null}
            </Box>
            <Box mb={4}>
              <Radio value="less">Less than or equal to</Radio>
              {type === 'less' ? (
                <HStack ml="1.5rem">
                  <NumberInput
                    w="16ch"
                    display="inline-block"
                    size="sm"
                    min={secondsToInput(maxMin, unit)}
                    max={secondsToInput(dataMax, unit)}
                    value={secondsToInput(filterMax, unit)}
                    onChange={(str, value) => {
                      setFilter((old) => [old?.[0], inputToSeconds(value, unit)]);
                    }}
                  >
                    <NumberInputField placeholder="Maximum value" />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                </HStack>
              ) : null}
            </Box>
            <Box mb={4}>
              <Radio value="more">Greater than or equal to</Radio>
              {type === 'more' ? (
                <HStack ml="1.5rem">
                  <NumberInput
                    w="16ch"
                    display="inline-block"
                    size="sm"
                    min={secondsToInput(dataMin, unit)}
                    max={secondsToInput(minMax, unit)}
                    value={secondsToInput(filterMin, unit)}
                    onChange={(str, value) => {
                      setFilter((old) => [inputToSeconds(value, unit), old?.[1]]);
                    }}
                  >
                    <NumberInputField placeholder="Minimum value" />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                </HStack>
              ) : null}
            </Box>
          </RadioGroup>
        </Stack>
      </PopoverBody>
      <FilterContentFooter
        apply={() => apply(filter)}
        clear={() => apply(undefined)}
        cancel={cancel}
        column={column}
        isDisabled={isDisabled}
      />
    </>
  );
};

export const OptionsFilter = ({
  column,
  cancel,
  apply,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  column: SbaaColumn<any>;
  cancel: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apply: React.Dispatch<React.SetStateAction<any>>;
}) => {
  const initial = column.getFilterValue() as string | undefined | boolean;
  const [filter, setFilter] = useState<string | undefined | boolean>(initial);

  const isDisabled = filter === undefined;

  const sortedUniqueValues = Array.from(column.getFacetedUniqueValues().keys()).sort();

  return (
    <>
      <PopoverBody w="auto" py={6} minW="17em" display="block">
        <ColumnLabel column={column} />
        <VirtualizedSelect
          size="sm"
          chakraStyles={{
            control: (styles) => ({
              ...styles,
              borderRadius: 'md',
            }),
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onChange={(o: any) => {
            setFilter(o.value);
          }}
          value={{ label: filter === undefined ? '' : String(filter), v: filter }}
          options={sortedUniqueValues.map((v) => ({ label: String(v), value: v }))}
        />
      </PopoverBody>
      <FilterContentFooter
        apply={() => apply(filter)}
        clear={() => apply(undefined)}
        cancel={cancel}
        column={column}
        isDisabled={isDisabled}
      />
    </>
  );
};

const FilterContentFooter = ({
  clear,
  column,
  cancel,
  apply,
  isDisabled,
}: {
  clear: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  column: SbaaColumn<any>;
  cancel: () => void;
  apply: () => void;
  isDisabled?: boolean | undefined;
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initial: any = column.getFilterValue();

  return (
    <PopoverFooter display="flex" justifyContent="space-between">
      {initial ? (
        <Button size="sm" variant="link" onClick={clear}>
          Remove
        </Button>
      ) : (
        <span />
      )}
      <ButtonGroup size="sm">
        <Button onClick={cancel} variant="outline">
          Cancel
        </Button>
        <Button isDisabled={isDisabled} onClick={apply} colorScheme="blue">
          Apply
        </Button>
      </ButtonGroup>
    </PopoverFooter>
  );
};
