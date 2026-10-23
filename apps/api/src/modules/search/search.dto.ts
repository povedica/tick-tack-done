import { ApiProperty } from '@nestjs/swagger';

export class SearchHitDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class SearchGroupDto {
  @ApiProperty({ enum: ['task', 'note', 'list', 'tag'] })
  type!: 'task' | 'note' | 'list' | 'tag';

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  items!: unknown[];
}

export class SearchResponseDto {
  @ApiProperty({ type: [Object] })
  items!: Record<string, unknown>[];

  @ApiProperty({ nullable: true, type: String })
  next_cursor!: string | null;

  @ApiProperty()
  text!: string;

  @ApiProperty({ nullable: true, type: String })
  list!: string | null;

  @ApiProperty({ type: [String] })
  tags!: string[];

  @ApiProperty({ nullable: true, enum: ['none', 'low', 'medium', 'high'] })
  priority!: 'none' | 'low' | 'medium' | 'high' | null;

  @ApiProperty({ nullable: true, type: Boolean })
  done!: boolean | null;

  @ApiProperty({ type: [SearchGroupDto] })
  groups!: SearchGroupDto[];
}
