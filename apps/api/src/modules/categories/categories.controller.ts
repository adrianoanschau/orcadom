import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentHousehold } from '../../common/decorators/current-household.decorator.js';
import { CategoriesService } from './categories.service.js';
import {
  CategoryParams,
  CreateCategoryBody,
  ListCategoriesQueryDto,
  UpdateCategoryBody,
} from './categories.dto.js';

@ApiTags('categories')
@ApiCookieAuth('accessToken')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Post()
  create(@CurrentHousehold() householdId: string, @Body() body: CreateCategoryBody) {
    return this.categories.create(householdId, body);
  }

  @Get()
  list(@CurrentHousehold() householdId: string, @Query() query: ListCategoriesQueryDto) {
    return this.categories.list(householdId, query);
  }

  @Patch(':id')
  update(
    @CurrentHousehold() householdId: string,
    @Param() params: CategoryParams,
    @Body() body: UpdateCategoryBody,
  ) {
    return this.categories.update(householdId, params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentHousehold() householdId: string, @Param() params: CategoryParams): Promise<void> {
    return this.categories.remove(householdId, params.id);
  }
}
