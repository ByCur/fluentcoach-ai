import { Body,Controller,Get,Inject,Param,Post,Query,Req,UseGuards } from '@nestjs/common';
import { VocabularyService } from '@fluentcoach/application';
import { dueReviewsQueryInput,vocabularyEmptyInput,vocabularyIdInput,vocabularyReviewInput } from '@fluentcoach/contracts';
import { AuthGuard,type AuthRequest } from './auth.guard.js';
import { CsrfGuard } from './csrf.guard.js';
@Controller('api/v1/vocabulary') @UseGuards(AuthGuard)
export class VocabularyController {
 constructor(@Inject(VocabularyService) private readonly vocabulary:VocabularyService){}
 @Get('suggestions') suggestions(@Req() r:AuthRequest){return this.vocabulary.suggestions(r.accountId!);}
 @Post('suggestions/:id/confirm') @UseGuards(CsrfGuard) confirm(@Req() r:AuthRequest,@Param('id') id:unknown,@Body() body:unknown){vocabularyEmptyInput.parse(body??{});return this.vocabulary.confirm(r.accountId!,vocabularyIdInput.parse(id));}
 @Post('suggestions/:id/ignore') @UseGuards(CsrfGuard) async ignore(@Req() r:AuthRequest,@Param('id') id:unknown,@Body() body:unknown){vocabularyEmptyInput.parse(body??{});await this.vocabulary.ignore(r.accountId!,vocabularyIdInput.parse(id));return {ignored:true};}
 @Get('cards') cards(@Req() r:AuthRequest){return this.vocabulary.cards(r.accountId!);}
 @Get('reviews/due') due(@Req() r:AuthRequest,@Query() query:unknown){const {limit}=dueReviewsQueryInput.parse(query);return this.vocabulary.due(r.accountId!,limit);}
 @Post('cards/:id/reviews') @UseGuards(CsrfGuard) review(@Req() r:AuthRequest,@Param('id') id:unknown,@Body() body:unknown){return this.vocabulary.review(r.accountId!,vocabularyIdInput.parse(id),vocabularyReviewInput.parse(body));}
 @Get('cards/:id/history') history(@Req() r:AuthRequest,@Param('id') id:unknown){return this.vocabulary.history(r.accountId!,vocabularyIdInput.parse(id));}
}
